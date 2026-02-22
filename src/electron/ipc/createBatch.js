import fs from "node:fs/promises";
import path from "node:path";
import { createBatchId, formatDay } from "./createBatchId.js";
import { getBatchPaths } from "./batchPaths.js";

/* ----------------------------- simple mutex ----------------------------- */
/**
 * Prosty lock, żeby nie odpalić dwóch batchy naraz (np. podwójny klik).
 * Działa w obrębie jednej instancji Electron (single-process).
 */
let RIP_LOCK = false;

async function withRipLock(fn) {
  if (RIP_LOCK) {
    return {
      ok: false,
      code: "RIP_LOCKED",
      userMessage: "Ripping is already running. Please wait until it finishes.",
    };
  }

  RIP_LOCK = true;
  try {
    return await fn();
  } finally {
    // finally odpali się zawsze: sukces / błąd / return
    RIP_LOCK = false;
  }
}

/* ----------------------------- fs helpers ------------------------------ */

/** mkdir -p */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Przeniesienie pliku:
 * - najpierw rename (szybkie)
 * - jak się nie uda (np. cross-device), to copy + unlink
 */
async function moveFileSafe(from, to) {
  try {
    await fs.rename(from, to);
  } catch {
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

/**
 * Czyści nazwę pliku z niedozwolonych znaków (Windows-safe).
 */
function safeFileName(name) {
  // eslint-disable-next-line no-control-regex
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

/** usuń folder batcha w rollbacku (best-effort) */
async function removeDirSafe(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

/* ------------------------------ error utils ------------------------------ */

/** Jednolity format błędu dla UI */
function appError(code, userMessage, details = {}) {
  return { ok: false, code, userMessage, details };
}

/**
 * Zamienia typowe błędy FS na czytelne kody i wiadomości,
 * plus zostawia raw szczegóły do debug.
 */
function mapFsError(err, fallbackCode = "FS_ERROR", fallbackMsg = "A file system error occurred.") {
  const rawCode = err?.code;
  const rawMessage = err?.message || String(err);

  switch (rawCode) {
    case "ENOENT":
      return appError("FS_NOT_FOUND", "A file or folder could not be found.", { rawCode, rawMessage });
    case "EACCES":
    case "EPERM":
      return appError("FS_PERMISSION", "Permission denied for a file or folder.", { rawCode, rawMessage });
    case "EBUSY":
      return appError("FS_BUSY", "A file is currently in use by another program. Close it and try again.", {
        rawCode,
        rawMessage,
      });
    case "ENOSPC":
      return appError("FS_NO_SPACE", "Not enough disk space.", { rawCode, rawMessage });
    default:
      return appError(fallbackCode, fallbackMsg, { rawCode, rawMessage });
  }
}

/* ----------------------------- main logic ------------------------------ */

/**
 * createBatch:
 * - waliduje input
 * - sprawdza pliki na dysku
 * - tworzy foldery batcha
 * - przenosi WSZYSTKIE pliki (albo rollback)
 * - zapisuje manifest (albo rollback)
 * - zwraca movedIds do szybkiego update UI
 */
export async function createBatch({ files, materialGroup, printer }) {
  return withRipLock(async () => {
    // ---------- 1) validation ----------
    if (!Array.isArray(files) || files.length === 0) {
      return appError("VALIDATION_NO_FILES", "No files selected for ripping.");
    }

    if (!printer) {
      return appError("VALIDATION_PRINTER_REQUIRED", "Please select a printer.");
    }

    if (materialGroup !== "cotton" && materialGroup !== "polyester") {
      return appError("VALIDATION_BAD_GROUP", "Invalid material group.");
    }

    // ---------- 2) normalize input (resolve paths + names) ----------
    // Zamieniamy różne możliwe pola w jednym standardzie:
    // - from: skąd przenosimy
    // - originalName: nazwa pliku
    // - meta: reszta danych (orderId, qty, material itd.)
    const resolved = files.map((f) => {
      const from = f.sourcePath || f.printFilePath || f.fullPath;
      const originalName = f.fileName || f.file?.name || path.basename(from || "");
      return {
        id: f.id ?? null,
        from,
        originalName,
        meta: f,
      };
    });

    // ---------- 3) missing source paths ----------
    const missingSource = resolved.filter((r) => !r.from);
    if (missingSource.length) {
      return appError("VALIDATION_MISSING_SOURCE_PATH", "Some files are missing a source path.", {
        missing: missingSource.map((x) => ({ id: x.id, fileName: x.originalName || "unknown" })),
      });
    }

    // ---------- 4) verify source files exist ----------
    // Dzięki temu UI dostaje konkretną listę brakujących plików,
    // a nie “random error w środku move”.
    const notFound = [];
    for (const r of resolved) {
      try {
        await fs.stat(r.from);
      } catch (err) {
        if (err?.code === "ENOENT") {
          notFound.push({
            id: r.id,
            fileName: r.originalName || path.basename(r.from),
            from: r.from,
          });
        } else {
          return mapFsError(err, "FS_STAT_FAILED", "Unable to check a source file.");
        }
      }
    }
    if (notFound.length) {
      return appError("VALIDATION_SOURCE_NOT_FOUND", "Some source files could not be found.", { notFound });
    }

    // ---------- 5) compute batchId + paths ----------
    const now = new Date();
    const day = formatDay(now);

    const batchId = createBatchId({
      date: now,
      materialGroup,
      printer,
      materialsInBatch: files.map((f) => f.material),
      count: files.length,
    });

    const paths = getBatchPaths({ day, batchId });

    // ---------- 6) create batch folders ----------
    try {
      await ensureDir(paths.sourceDir);
      await ensureDir(paths.readyDir);
      await ensureDir(paths.nestedDir);
      await ensureDir(paths.logsDir);
    } catch (err) {
      return mapFsError(err, "FS_MKDIR_FAILED", "Unable to create batch folders.");
    }

    // moved: “co realnie przenieśliśmy”
    const moved = [];

    // failed: info o rollback/cleanup fail (best-effort)
    const failed = [];

    // rollbackMoves: lista “jak cofnąć to, co przenieśliśmy”
    const rollbackMoves = [];

    // usedNames: żeby nie nadpisywać plików o tej samej nazwie w jednym folderze batcha
    const usedNames = new Set();

    // ---------- 7) transactional part: move all OR rollback ----------
    try {
      for (const r of resolved) {
        const from = r.from;

        // a) sanitize name
        let baseName = safeFileName(r.originalName || "file");
        let finalName = baseName;

        // b) avoid duplicates: file.png, file__1.png, file__2.png...
        let i = 1;
        while (usedNames.has(finalName.toLowerCase())) {
          const ext = path.extname(baseName);
          const stem = path.basename(baseName, ext);
          finalName = `${stem}__${i}${ext}`;
          i++;
        }
        usedNames.add(finalName.toLowerCase());

        const to = path.join(paths.sourceDir, finalName);

        // c) move file
        try {
          await moveFileSafe(from, to);
        } catch (err) {
          // rzucamy "oznaczony" błąd, żeby niżej ładnie go sklasyfikować
          throw Object.assign(new Error("MOVE_FAILED"), { cause: err, from, to, fileName: finalName });
        }

        // d) zapisujemy co przenieśliśmy
        moved.push({
          id: r.id ?? null, // <-- dodane: prostsze dla UI
          from,
          to,
          fileName: finalName,
          meta: r.meta,
        });

        // e) i jak to cofnąć
        rollbackMoves.push({ from: to, to: from }); // reverse move
      }

      // ---------- 8) manifest: opis batcha jako "source of truth" ----------
      const manifest = {
        batchId,
        day,
        createdAt: now.toISOString(),
        printerName: printer,
        materialGroup,
        status: "CREATED",
        paths: {
          batchRoot: paths.batchRoot,
          sourceDir: paths.sourceDir,
          readyDir: paths.readyDir,
          nestedDir: paths.nestedDir,
          logsDir: paths.logsDir,
        },
        expectedCount: files.length,
        movedCount: moved.length,
        failedCount: 0,
        files: moved.map((m) => ({
          fileName: m.fileName,
          sourcePath: m.to,
          originalPath: m.from,
          id: m.meta?.id ?? m.id ?? null,
          orderId: m.meta?.orderId ?? null,
          printType: m.meta?.printType ?? null,
          qty: m.meta?.qty ?? null,
          size: m.meta?.size ?? null,
          material: m.meta?.material ?? null,
          printFolder: m.meta?.printFolder ?? null,
          status: m.meta?.status ?? null,
        })),
      };

      // zapis manifestu = warunek sukcesu
      try {
        await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      } catch (err) {
        throw Object.assign(new Error("MANIFEST_WRITE_FAILED"), { cause: err });
      }

      // ---------- 9) movedIds: do szybkiej aktualizacji UI (bez rescanu) ----------
      const movedIds = moved.map((m) => m.id).filter(Boolean);

      return { ok: true, batchId, day, ...paths, moved, movedIds, failed };
    } catch (err) {
      // ---------- rollback section ----------
      // Cofamy przeniesienia w odwrotnej kolejności (bezpieczniej).
      for (let i = rollbackMoves.length - 1; i >= 0; i--) {
        const { from, to } = rollbackMoves[i];
        try {
          await ensureDir(path.dirname(to));
          await moveFileSafe(from, to);
        } catch (error) {
          failed.push({
            from,
            to,
            error: `Rollback failed: ${error?.message || String(error)}`,
          });
        }
      }

      // cleanup batch folder (best-effort)
      try {
        await removeDirSafe(paths.batchRoot);
      } catch (cleanupErr) {
        failed.push({ error: `Cleanup failed: ${cleanupErr?.message || String(cleanupErr)}` });
      }

      // ---------- classify error ----------
      if (err?.message === "MOVE_FAILED") {
        const mapped = mapFsError(err.cause, "FS_MOVE_FAILED", "Unable to move one of the files.");
        return {
          ...mapped,
          details: {
            ...mapped.details,
            file: { from: err.from, to: err.to, fileName: err.fileName },
            rollbackFailed: failed.length ? failed : undefined,
          },
        };
      }

      if (err?.message === "MANIFEST_WRITE_FAILED") {
        const mapped = mapFsError(err.cause, "MANIFEST_WRITE_FAILED", "Unable to write the batch manifest.");
        return {
          ...mapped,
          details: {
            ...mapped.details,
            rollbackFailed: failed.length ? failed : undefined,
          },
        };
      }

      return appError("UNKNOWN", "Something went wrong while creating the batch.", {
        rawMessage: err?.message || String(err),
        rollbackFailed: failed.length ? failed : undefined,
      });
    }
  });
}
