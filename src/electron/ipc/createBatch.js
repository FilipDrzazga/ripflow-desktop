import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createBatchIds } from "../helpers/createBatchIds.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { toIpcError } from "../helpers/ipcError.js";

const LOCK_HEARTBEAT_MS = 10 * 1000;   // odświeżanie mtime locka w trakcie COPY
const STALE_LOCK_MS = 90 * 1000;       // brak heartbeatu dłużej niż to = lock martwy

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  LOCK: "lock",
  DESTINATION_STRUCTURE: "destination_structure",
  COPY: "copy",
  VERIFY: "verify",
  COMMIT: "commit",
  DELETE_SOURCE: "delete_source",
  ROLLBACK: "rollback",
  DONE: "done",
};

const exists = async (targetPath) => {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
};

const toBatchError = (error, stage, fallbackTitle = "Batch creation failed") =>
  toIpcError(error, stage, fallbackTitle);

const getPrintedRootPath = () => {
  const rootPath = getStorageRootPath();
  return path.resolve(rootPath, "PRINTED");
};

const getBatchFolderPath = (batchId) => {
  return path.join(getPrintedRootPath(), batchId);
};

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;
const TEMP_DIR_PREFIX = ".tmp-";
const ORPHAN_TEMP_MS = 60 * 60 * 1000; // 1h — a live temp only exists for the duration of one COPY

// Startup sweep for .tmp-* batch folders left behind by a hard crash during COPY (before
// COMMIT rename or ROLLBACK cleanup). Scans only PRINTED\DD-MM-YYYY\* and removes ONLY
// directories named ".tmp-*" older than 1h. Best-effort: never throws, never blocks startup.
export const sweepOrphanTemps = async () => {
  const printedRoot = getPrintedRootPath();
  let removed = 0;

  let dayFolders;
  try {
    dayFolders = await fs.promises.readdir(printedRoot, { withFileTypes: true });
  } catch {
    return removed; // PRINTED missing / unreadable — nothing to sweep
  }

  for (const dayEntry of dayFolders) {
    if (!dayEntry.isDirectory() || !DAY_FOLDER_RE.test(dayEntry.name)) continue;

    const dayPath = path.join(printedRoot, dayEntry.name);
    let entries;
    try {
      entries = await fs.promises.readdir(dayPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(TEMP_DIR_PREFIX)) continue;

      const tempPath = path.join(dayPath, entry.name);
      try {
        const stat = await fs.promises.stat(tempPath);
        if (Date.now() - stat.mtimeMs <= ORPHAN_TEMP_MS) continue;
        await fs.promises.rm(tempPath, { recursive: true, force: true });
        removed += 1;
      } catch (err) {
        console.error(`[sweep] failed to remove orphan temp ${tempPath}:`, err);
      }
    }
  }

  if (removed > 0) console.log(`[sweep] removed ${removed} orphan temp folder(s)`);
  return removed;
};

const copyPdfFirstPage = async (srcPath, destPath) => {
  const srcBytes = await fs.promises.readFile(srcPath);
  const srcDoc = await PDFDocument.load(srcBytes);

  if (srcDoc.getPageCount() <= 1) {
    await fs.promises.copyFile(srcPath, destPath, fs.constants.COPYFILE_EXCL);
    const stat = await fs.promises.stat(destPath);
    return stat.size;
  }

  const outDoc = await PDFDocument.create();
  const [page] = await outDoc.copyPages(srcDoc, [0]);
  outDoc.addPage(page);
  const outBytes = await outDoc.save();
  await fs.promises.writeFile(destPath, outBytes, { flag: "wx" });
  return outBytes.byteLength;
};

export const createBatch = async (batch) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    movedFiles: [],
    skippedFiles: [],
    rollbackPerformed: false,
    batchId: null,
  };

  let stage = STAGES.INIT;
  const lockRecords = [];
  let lockHeartbeat = null;
  const copiedFiles = [];
  const deletedSourceFiles = [];

  let tempBatchFolderPath = null;
  let finalBatchFolderPath = null;
  let committed = false;

  try {
    stage = STAGES.VALIDATE;

    if (!Array.isArray(batch) || batch.length === 0) {
      throw Object.assign(new Error("Batch must be a non-empty array."), {
        code: "ERR_INVALID_ARG_TYPE",
        stage,
        title: "Invalid batch input",
      });
    }

    const PRINTED_ROOT_PATH = getPrintedRootPath();
    const batchIds = createBatchIds(batch);

    const sourceEntries = batch.map((item, index) => {
      const sourcePath = path.resolve(item?.file?.fullPath || "");
      const fileName = path.basename(sourcePath);

      if (!item?.file?.fullPath) {
        throw Object.assign(new Error(`Missing source file path at index ${index}.`), {
          code: "EINVAL",
          stage,
          title: "Invalid source file",
        });
      }

      return {
        sourcePath,
        fileName,
        sourceDir: path.dirname(sourcePath),
      };
    });

    const sourceFileNames = new Set();
    for (const entry of sourceEntries) {
      if (sourceFileNames.has(entry.fileName)) {
        throw Object.assign(new Error("File name collision detected in batch."), {
          code: "EEXIST",
          stage,
          title: "File name collision",
        });
      }
      sourceFileNames.add(entry.fileName);
    }

    for (const entry of sourceEntries) {
      let stat;
      try {
        stat = await fs.promises.stat(entry.sourcePath);
      } catch (err) {
        if (err.code === "ENOENT") {
          throw Object.assign(new Error(`Source file does not exist: ${entry.sourcePath}`), {
            code: "ENOENT",
            stage,
            title: "Invalid source file",
          });
        }
        throw err;
      }

      if (!stat.isFile()) {
        throw Object.assign(new Error(`Source path is not a file: ${entry.sourcePath}`), {
          code: "EISDIR",
          stage,
          title: "Invalid source file",
        });
      }

      entry.size = stat.size;
    }

    stage = STAGES.LOCK;
    let staleLockRemoved = false;
    for (const sourceFolderPath of [...new Set(sourceEntries.map((entry) => entry.sourceDir))]) {
      const lockPath = path.join(sourceFolderPath, ".lock");

      // Remove stale lock left by a previous crash. Age is measured against the NAS
      // clock (probe file mtime), not Date.now(), so PC↔NAS skew cannot make a live
      // lock look stale (premature delete → double print) or a dead lock look live.
      try {
        const lockStat = await fs.promises.stat(lockPath);

        let nowOnServer = null;
        const probePath = path.join(sourceFolderPath, `.lockprobe-${process.pid}-${Date.now()}`);
        try {
          await fs.promises.writeFile(probePath, "");
          nowOnServer = (await fs.promises.stat(probePath)).mtimeMs; // "now" per NAS clock
        } catch {
          nowOnServer = null; // probe failed — fall back conservatively below
        } finally {
          await fs.promises.unlink(probePath).catch(() => {});
        }

        if (nowOnServer != null) {
          if (nowOnServer - lockStat.mtimeMs > STALE_LOCK_MS) {
            await fs.promises.unlink(lockPath);
            staleLockRemoved = true;
          }
        } else {
          // No NAS reference available. Do NOT delete on a small Date.now() threshold —
          // skew could make a live lock look stale and cause a double print. Only clear
          // a lock that is conservatively old by the local clock (5 min), and warn.
          result.warnings.push(`NAS lock probe failed in ${sourceFolderPath}; using conservative 5min fallback`);
          if (Date.now() - lockStat.mtimeMs > 5 * 60 * 1000) {
            await fs.promises.unlink(lockPath);
            staleLockRemoved = true;
          }
        }
      } catch {
        // no lock file — proceed normally
      }

      try {
        const handle = await fs.promises.open(lockPath, "wx");
        await handle.writeFile(
          JSON.stringify({
            pid: process.pid,
            batchId: batchIds.mainFolder,
            timestamp: new Date().toISOString(),
          }),
        );
        lockRecords.push({ handle, lockPath });
      } catch (err) {
        if (err.code === "EEXIST") {
          throw Object.assign(new Error(`Lock file already exists: ${lockPath}`), {
            code: "EEXIST",
            stage,
            title: "Source folder locked",
          });
        }
        throw err;
      }
    }

    // Keep our locks "alive" during a long COPY by refreshing their mtime. A station
    // that finds our lock will measure its age from the last heartbeat, not from when
    // it was first created — so a slow copy can never make a live lock look stale.
    lockHeartbeat = setInterval(() => {
      const t = new Date();
      for (const { lockPath } of lockRecords) {
        fs.promises.utimes(lockPath, t, t).catch(() => {});
      }
    }, LOCK_HEARTBEAT_MS);

    // If we removed another station's stale lock, that station may have been mid-move.
    // Re-stat the sources before copying: if any vanished (ENOENT), it was already moved
    // — abort cleanly rather than copy a file that is being relocated by someone else.
    if (staleLockRemoved) {
      for (const entry of sourceEntries) {
        try {
          const stat = await fs.promises.stat(entry.sourcePath);
          if (!stat.isFile()) {
            throw Object.assign(new Error(`Source path is no longer a file: ${entry.sourcePath}`), {
              code: "EISDIR",
              stage,
              title: "Source changed during lock",
            });
          }
        } catch (err) {
          if (err.code === "ENOENT") {
            throw Object.assign(new Error(`Source file was moved by another station: ${entry.sourcePath}`), {
              code: "ENOENT",
              stage,
              title: "Source changed during lock",
            });
          }
          throw err;
        }
      }
    }

    stage = STAGES.DESTINATION_STRUCTURE;
    await fs.promises.mkdir(PRINTED_ROOT_PATH, { recursive: true });

    const baseFinalPath = path.join(PRINTED_ROOT_PATH, batchIds.mainFolder, batchIds.subFolder);
    finalBatchFolderPath = baseFinalPath;
    let suffix = 1;
    while (await exists(finalBatchFolderPath)) {
      finalBatchFolderPath = `${baseFinalPath}_${suffix}`;
      suffix += 1;
    }

    // Create the date subfolder first so temp and final share the same parent —
    // fs.rename across different directories fails with EPERM on Windows network shares (SMB).
    const finalParentDir = path.dirname(finalBatchFolderPath);
    await fs.promises.mkdir(finalParentDir, { recursive: true });

    tempBatchFolderPath = path.join(
      finalParentDir,
      `.tmp-${batchIds.subFolder}-${process.pid}-${Date.now()}`,
    );

    await fs.promises.mkdir(tempBatchFolderPath, { recursive: true });

    stage = STAGES.COPY;
    for (const entry of sourceEntries) {
      const tempTargetPath = path.join(tempBatchFolderPath, entry.fileName);

      let writtenSize;
      try {
        writtenSize = await copyPdfFirstPage(entry.sourcePath, tempTargetPath);
      } catch (err) {
        throw Object.assign(new Error(`Failed to copy file ${entry.fileName}: ${err.message}`), {
          code: err.code || "EIO",
          stage,
          title: "File copy failed",
        });
      }

      copiedFiles.push({
        sourcePath: entry.sourcePath,
        tempPath: tempTargetPath,
        finalPath: path.join(finalBatchFolderPath, entry.fileName),
        size: writtenSize,
      });
    }

    stage = STAGES.VERIFY;
    for (const copied of copiedFiles) {
      const copiedStat = await fs.promises.stat(copied.tempPath);
      if (!copiedStat.isFile() || copiedStat.size !== copied.size) {
        throw Object.assign(new Error(`Copied file verification failed: ${copied.tempPath}`), {
          code: "EIO",
          stage,
          title: "Copy verification failed",
        });
      }
    }

    stage = STAGES.COMMIT;
    await fs.promises.rename(tempBatchFolderPath, finalBatchFolderPath);
    committed = true;

    try {
      // Persistent provenance (Etap 2): one entry per file that has an effective
      // printed amount (manual override OR reprint). Shape:
      //   { printed: { meters }|{ qty }, manual: bool, reprintQty, reprintOriginal }
      const overridesMap = {};
      for (const item of batch) {
        if (item._printed == null) continue;
        const stem = path.parse(item.file?.name ?? "").name;
        overridesMap[stem] = {
          printed: item._printed,
          manual: item._manual === true,
          reprintQty: item._reprintQty ?? null,
          reprintOriginal: item._reprintOriginal ?? null,
        };
      }
      await fs.promises.writeFile(
        path.join(finalBatchFolderPath, "_batch_info.json"),
        JSON.stringify({
          originalGroup: path.basename(sourceEntries[0].sourceDir),
          ...(Object.keys(overridesMap).length > 0 ? { overrides: overridesMap } : {}),
        }, null, 2),
        "utf8",
      );
    } catch {
      // best-effort metadata
    }

    stage = STAGES.DELETE_SOURCE;
    for (const copied of copiedFiles) {
      await fs.promises.unlink(copied.sourcePath);
      deletedSourceFiles.push(copied);
      result.movedFiles.push(copied.sourcePath);
    }

    result.success = true;
    result.batchId = `${batchIds.mainFolder}/${path.basename(finalBatchFolderPath)}`;
    result.finalBatchFolderPath = finalBatchFolderPath;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toBatchError(error, stage));

    stage = STAGES.ROLLBACK;

    for (const fileRecord of deletedSourceFiles) {
      try {
        const restoreFromPath = committed ? fileRecord.finalPath : fileRecord.tempPath;
        const sourceExists = await exists(fileRecord.sourcePath);

        if (!sourceExists) {
          await fs.promises.copyFile(restoreFromPath, fileRecord.sourcePath);
        }
      } catch (restoreErr) {
        result.warnings.push(`Failed to restore source file ${fileRecord.sourcePath}: ${restoreErr.message}`);
      }
    }

    try {
      if (committed && finalBatchFolderPath) {
        await fs.promises.rm(finalBatchFolderPath, { recursive: true, force: true });
      }
      if (!committed && tempBatchFolderPath) {
        await fs.promises.rm(tempBatchFolderPath, { recursive: true, force: true });
      }
      result.rollbackPerformed = true;
    } catch (rollbackErr) {
      result.warnings.push(`Rollback cleanup failed: ${rollbackErr.message}`);
    }
  } finally {
    // CRITICAL: stop the heartbeat before releasing locks — otherwise the interval
    // leaks past every batch and keeps calling utimes() on already-deleted lock files.
    if (lockHeartbeat) {
      clearInterval(lockHeartbeat);
      lockHeartbeat = null;
    }

    for (const lockRecord of lockRecords) {
      try {
        await lockRecord.handle.close();
      } catch (err) {
        if (err.code !== "EBADF") {
          result.warnings.push(`Failed to close lock handle ${lockRecord.lockPath}: ${err.message}`);
        }
      }

      try {
        await fs.promises.unlink(lockRecord.lockPath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          result.warnings.push(`Failed to remove lock file ${lockRecord.lockPath}: ${err.message}`);
        }
      }
    }
  }

  return result;
};

export const rollbackBatch = async (batch, batchId) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    restoredFiles: [],
    rollbackPerformed: false,
  };

  let stage = STAGES.INIT;

  try {
    stage = STAGES.VALIDATE;

    if (!Array.isArray(batch) || batch.length === 0) {
      throw Object.assign(new Error("Batch must be a non-empty array."), {
        code: "ERR_INVALID_ARG_TYPE",
        stage,
        title: "Invalid batch input",
      });
    }

    if (typeof batchId !== "string" || batchId.trim() === "") {
      throw Object.assign(new Error("Batch ID is required for rollback."), {
        code: "ERR_INVALID_BATCH_ID",
        stage,
        title: "Invalid batch ID",
      });
    }

    const normalizedBatchId = batchId.trim();
    const batchFolderPath = getBatchFolderPath(normalizedBatchId);
    const batchFolderExists = await exists(batchFolderPath);

    if (!batchFolderExists) {
      throw Object.assign(new Error(`Created batch folder does not exist: ${batchFolderPath}`), {
        code: "ENOENT",
        stage,
        title: "Batch rollback failed",
      });
    }

    stage = STAGES.ROLLBACK;

    for (const item of batch) {
      const sourcePath = path.resolve(item?.file?.fullPath || "");
      const fileName = path.basename(sourcePath);
      const batchFilePath = path.join(batchFolderPath, fileName);

      if (!sourcePath) {
        throw Object.assign(new Error("Missing source file path during rollback."), {
          code: "EINVAL",
          stage,
          title: "Batch rollback failed",
        });
      }

      await fs.promises.mkdir(path.dirname(sourcePath), { recursive: true });
      await fs.promises.rename(batchFilePath, sourcePath);
      result.restoredFiles.push(sourcePath);
    }

    await fs.promises.rm(batchFolderPath, { recursive: true, force: true });
    result.success = true;
    result.rollbackPerformed = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toBatchError(error, stage, "Batch rollback failed"));
  }

  return result;
};
