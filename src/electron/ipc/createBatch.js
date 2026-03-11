import fs from "fs";
import path from "path";
import { createBatchIds } from "../helpers/createBatchIds.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";

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

const toBatchError = (error, stage, fallbackTitle = "Batch creation failed") => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
    title: error.title || fallbackTitle,
  };
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

    const ROOT_PATH = getStorageRootPath();
    const PRINTED_ROOT_PATH = path.resolve(ROOT_PATH, "PRINTED");
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
    for (const sourceFolderPath of [...new Set(sourceEntries.map((entry) => entry.sourceDir))]) {
      const lockPath = path.join(sourceFolderPath, ".lock");

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

    stage = STAGES.DESTINATION_STRUCTURE;
    await fs.promises.mkdir(PRINTED_ROOT_PATH, { recursive: true });

    const baseFinalPath = path.join(PRINTED_ROOT_PATH, batchIds.mainFolder, batchIds.subFolder);
    finalBatchFolderPath = baseFinalPath;
    let suffix = 1;
    while (await exists(finalBatchFolderPath)) {
      finalBatchFolderPath = `${baseFinalPath}_${suffix}`;
      suffix += 1;
    }

    tempBatchFolderPath = path.join(
      PRINTED_ROOT_PATH,
      `.tmp-${batchIds.mainFolder}-${batchIds.subFolder}-${process.pid}-${Date.now()}`,
    );

    await fs.promises.mkdir(tempBatchFolderPath, { recursive: true });

    stage = STAGES.COPY;
    for (const entry of sourceEntries) {
      const tempTargetPath = path.join(tempBatchFolderPath, entry.fileName);

      await fs.promises.copyFile(entry.sourcePath, tempTargetPath, fs.constants.COPYFILE_EXCL);
      copiedFiles.push({
        sourcePath: entry.sourcePath,
        tempPath: tempTargetPath,
        finalPath: path.join(finalBatchFolderPath, entry.fileName),
        size: entry.size,
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
    await fs.promises.mkdir(path.dirname(finalBatchFolderPath), { recursive: true });
    await fs.promises.rename(tempBatchFolderPath, finalBatchFolderPath);
    committed = true;

    stage = STAGES.DELETE_SOURCE;
    for (const copied of copiedFiles) {
      await fs.promises.unlink(copied.sourcePath);
      deletedSourceFiles.push(copied);
      result.movedFiles.push(copied.sourcePath);
    }

    result.success = true;
    result.batchId = `${batchIds.mainFolder}/${path.basename(finalBatchFolderPath)}`;
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
