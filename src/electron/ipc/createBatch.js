// src/electron/ipc/createBatch.js
import fs from "node:fs/promises";
import path from "node:path";
import { createBatchId, formatDay } from "./createBatchId.js";
import { getBatchPaths } from "./batchPaths.js";

/* ----------------------------- simple mutex ----------------------------- */
// Single-process mutex (good enough for one running Electron instance)
let RIP_LOCK = false;

async function withRipLock(fn) {
  if (RIP_LOCK) {
    return { ok: false, error: "RIP is already running" };
  }
  RIP_LOCK = true;
  try {
    return await fn();
  } finally {
    RIP_LOCK = false;
  }
}

/* ----------------------------- fs helpers ------------------------------ */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFileSafe(from, to) {
  try {
    await fs.rename(from, to);
  } catch (_err) {
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

function safeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

async function removeDirSafe(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

/* ----------------------------- main logic ------------------------------ */
export async function createBatch({ files, materialGroup, printer }) {
  return withRipLock(async () => {
    if (!Array.isArray(files) || files.length === 0) {
      return { ok: false, error: "No files provided" };
    }

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

    // create folders
    await ensureDir(paths.sourceDir);
    await ensureDir(paths.readyDir);
    await ensureDir(paths.nestedDir);
    await ensureDir(paths.logsDir);

    const moved = [];
    const failed = [];

    // Track what we moved so we can rollback if anything fails
    const rollbackMoves = [];

    const usedNames = new Set();

    try {
      for (const f of files) {
        const from = f.sourcePath || f.printFilePath || f.fullPath;
        const originalName = f.fileName || f.file?.name || path.basename(from || "");
        if (!from) {
          throw new Error("Missing sourcePath/fullPath for one of the files");
        }

        let baseName = safeFileName(originalName || "file");
        let finalName = baseName;

        let i = 1;
        while (usedNames.has(finalName.toLowerCase())) {
          const ext = path.extname(baseName);
          const stem = path.basename(baseName, ext);
          finalName = `${stem}__${i}${ext}`;
          i++;
        }
        usedNames.add(finalName.toLowerCase());

        const to = path.join(paths.sourceDir, finalName);

        await moveFileSafe(from, to);

        moved.push({ from, to, fileName: finalName, meta: f });
        rollbackMoves.push({ from: to, to: from }); // reverse move
      }

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
          id: m.meta?.id ?? null,
          orderId: m.meta?.orderId ?? null,
          printType: m.meta?.printType ?? null,
          qty: m.meta?.qty ?? null,
          size: m.meta?.size ?? null,
          material: m.meta?.material ?? null,
          printFolder: m.meta?.printFolder ?? null,
          status: m.meta?.status ?? null,
        })),
      };

      await fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      return {
        ok: true,
        batchId,
        day,
        ...paths,
        moved,
        failed,
      };
    } catch (err) {
      // rollback: move back files we already moved
      for (let i = rollbackMoves.length - 1; i >= 0; i--) {
        const { from, to } = rollbackMoves[i];
        try {
          await ensureDir(path.dirname(to));
          await moveFileSafe(from, to);
        } catch (rollbackErr) {
          failed.push({
            from,
            to,
            error: `Rollback failed: ${rollbackErr?.message || String(rollbackErr)}`,
          });
        }
      }

      // cleanup batch folder (best-effort)
      await removeDirSafe(paths.batchRoot);

      return {
        ok: false,
        error: err?.message || String(err),
        failed,
      };
    }
  });
}
