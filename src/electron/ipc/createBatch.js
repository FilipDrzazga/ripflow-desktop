import fs from "node:fs/promises";
import path from "node:path";
import { createBatchId, formatDay } from "./createBatchId.js";
import { getBatchPaths } from "./batchPaths.js";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFileSafe(from, to) {
  // Na Windows czasem rename wywala przy cross-device; wtedy fallback copy+unlink.
  try {
    await fs.rename(from, to);
  } catch (err) {
    // fallback
    console.log(err.message);
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

function safeFileName(name) {
  // minimalna sanityzacja: usuń znaki zakazane w Windows
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

export async function createBatch({ files, materialGroup }) {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: "No files provided" };
  }

  const now = new Date();
  const day = formatDay(now);
  const batchId = createBatchId({ date: now, materialGroup, count: files.length });

  const paths = getBatchPaths({ day, batchId });

  // 1) foldery
  await ensureDir(paths.sourceDir);
  await ensureDir(paths.readyDir);
  await ensureDir(paths.nestedDir);
  await ensureDir(paths.logsDir);

  // 2) move plików do source
  const moved = [];
  const failed = [];

  // żeby uniknąć kolizji nazw, numerujemy jeśli trzeba
  const usedNames = new Set();

  for (const f of files) {
    const from = f.sourcePath || f.printFilePath || f.fullPath;
    const originalName = f.fileName || f.file?.name || path.basename(from || "");
    if (!from) {
      failed.push({ from: null, error: "Missing sourcePath/fullPath" });
      continue;
    }

    let baseName = safeFileName(originalName || "file");
    if (!baseName.toLowerCase().endsWith(".pdf")) {
      // nie wymuszam .pdf, ale jeśli chcesz:
      // baseName = `${baseName}.pdf`;
    }

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

    try {
      await moveFileSafe(from, to);
      moved.push({ from, to, fileName: finalName, meta: f });
    } catch (err) {
      failed.push({ from, to, error: err?.message || String(err) });
    }
  }

  // 3) manifest
  const manifest = {
    batchId,
    day,
    createdAt: now.toISOString(),
    materialGroup,
    status: failed.length === 0 ? "CREATED" : "CREATED_WITH_ERRORS",
    paths: {
      batchRoot: paths.batchRoot,
      sourceDir: paths.sourceDir,
      readyDir: paths.readyDir,
      nestedDir: paths.nestedDir,
      logsDir: paths.logsDir,
    },
    expectedCount: files.length,
    movedCount: moved.length,
    failedCount: failed.length,
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
    failed,
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
}
