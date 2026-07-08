import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";
import { toIpcError } from "../helpers/ipcError.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { submitBatchToPrintFactory } from "./createXML.js";
import { parseBatchFolderName, normalizeOverrideEntry } from "./readPrintedFolder.js";
import { insertRollbackReason, insertReprintRequest, clearFileStage, resolveRipErrorsByFile } from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { GROUP_NAME_OVERRIDES_REVERSE } from "../helpers/createBatchIds.js";
import { getCachedFabrics, getCachedGlobals } from "../helpers/fabricCache.js";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";

const toError = (err, title = "Operation failed") => toIpcError(err, "unknown", title);

// Pure resolution (no I/O): pick the inbox group a file should roll back to.
// Order: per-file map → batch-level originalGroup → REVERSE override → shortGroup.
// `info` may be null (missing/corrupt _batch_info.json) → drops straight to fallbacks.
const resolveGroupFromInfo = (info, shortGroup, stem = null) => {
  if (stem && info?.fileGroups?.[stem]) return info.fileGroups[stem];
  if (info?.originalGroup) return info.originalGroup;
  return GROUP_NAME_OVERRIDES_REVERSE[shortGroup] ?? shortGroup;
};

// Async wrapper: read _batch_info.json ONCE, then resolve. Used by the single-file
// path (one read either way).
const resolveOriginalGroup = async (batchPath, shortGroup, stem = null) => {
  let info = null;
  try {
    const raw = await fs.promises.readFile(path.join(batchPath, "_batch_info.json"), "utf8");
    info = JSON.parse(raw);
  } catch {
    // no/corrupt metadata file → resolveGroupFromInfo handles null via fallbacks
  }
  return resolveGroupFromInfo(info, shortGroup, stem);
};

const renameNoOverwrite = async (src, dest) => {
  try {
    await fs.promises.access(dest);
    throw Object.assign(new Error(`Destination already exists: ${dest}`), { code: "EEXIST" });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;   // ENOENT = wolne; EEXIST/inne → w górę
  }
  await fs.promises.rename(src, dest);
};

export const rollbackBatchFromHistory = async ({ batchPath, reason } = {}) => {
  const result = { success: false, errors: [], restoredFiles: [], failedFiles: [] };

  try {
    const validatedBatchPath = await assertStorageFilePath(batchPath, {
      stage: "validate",
      title: "Invalid batch path",
      allowDirectory: true,
    });

    const meta = parseBatchFolderName(path.basename(validatedBatchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    // Read provenance ONCE; each file resolves its own group from this in the loop.
    let batchInfo = null;
    try {
      const raw = await fs.promises.readFile(path.join(validatedBatchPath, "_batch_info.json"), "utf8");
      batchInfo = JSON.parse(raw);
    } catch {
      // no/corrupt _batch_info.json → resolveGroupFromInfo falls back per file
    }
    const storageRoot = getStorageRootPath();

    const entries = await fs.promises.readdir(validatedBatchPath, { withFileTypes: true });
    // PO
    const pdfNames = entries.filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".pdf")).map((f) => f.name);

    try {
      const snapshotPath = path.join(validatedBatchPath, "_rollback_snapshot.json");
      let existingFiles = [];
      try {
        const raw = await fs.promises.readFile(snapshotPath, "utf8");
        const existing = JSON.parse(raw);
        if (Array.isArray(existing.files)) existingFiles = existing.files;
      } catch {
        // no existing snapshot
      }
      const mergedFiles = [...new Set([...existingFiles, ...pdfNames])];
      await fs.promises.writeFile(
        snapshotPath,
        JSON.stringify({ rolledBackAt: new Date().toISOString(), type: "batch", files: mergedFiles }, null, 2),
        "utf8",
      );
    } catch {
      // best-effort snapshot
    }
    const workstation = reason ? getSettings().workstationName : null;
    for (const f of entries) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith(".pdf")) continue;
      const stem = f.name.replace(/\.[^.]+$/, "");
      const group = resolveGroupFromInfo(batchInfo, meta.group, stem);
      const destDir = path.join(storageRoot, group);
      const src = path.join(validatedBatchPath, f.name);
      const dest = path.join(destDir, f.name);
      try {
        await fs.promises.mkdir(destDir, { recursive: true });
        await renameNoOverwrite(src, dest);
        // uzgodnienie DB natychmiast po udanym rename — wzorzec single-file
        clearFileStage(stem);
        resolveRipErrorsByFile(stem);
        if (reason) {
          const p = parsePrintFileName(f.name);
          const parsed = p ? { ...p, materialType: p.material ? getMaterialType(p.material) : "Unknown" } : null;
          const fileFabric = parsed?.material ?? null;
          const metersResult = parsed
            ? estimatePrintLength([parsed], { globals: getCachedGlobals(), fabrics: getCachedFabrics() })
            : null;
          insertRollbackReason({
            id: crypto.randomUUID(),
            fileId: stem,
            batchPath: validatedBatchPath,
            reasonCode: reason.code,
            reasonLabel: reason.label,
            workstation,
            orderId: parsed?.orderId ?? null,
            customer: parsed?.customerName ?? null,
            fabric: fileFabric,
            process: getMaterialType(fileFabric),
            printType: parsed?.printTypeCode ?? null,
            meters: metersResult?.fixedTotalLengthM ?? null,
          });
        }
        result.restoredFiles.push(dest);
      } catch (err) {
        result.failedFiles.push({ name: f.name, error: toError(err, "File rollback failed") });
        // kontynuuj — pad jednego pliku nie blokuje reszty (best-effort)
      }
    }
    result.success = result.failedFiles.length === 0;
  } catch (err) {
    result.errors = [toError(err, err.title || "Rollback failed")];
  }

  return result;
};

// reprint: { qtyAffected, qtyOriginal } — passed only by Production rollbacks;
// unit follows print type (meters for LM, piece count otherwise).
export const rollbackFileFromHistory = async ({ filePath, batchPath, reason, reprint } = {}) => {
  const result = { success: false, errors: [] };

  try {
    const validatedFilePath = await assertStorageFilePath(filePath, {
      stage: "validate",
      title: "Invalid file path",
    });
    const validatedBatchPath = await assertStorageFilePath(batchPath, {
      stage: "validate",
      title: "Invalid batch path",
      allowDirectory: true,
    });

    const meta = parseBatchFolderName(path.basename(validatedBatchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const filename = path.basename(validatedFilePath);
    const originalGroup = await resolveOriginalGroup(
      validatedBatchPath,
      meta.group,
      path.parse(filename).name,
    );
    const destDir = path.join(getStorageRootPath(), originalGroup);
    await fs.promises.mkdir(destDir, { recursive: true });

    const snapshotPath = path.join(validatedBatchPath, "_rollback_snapshot.json");
    try {
      let snapshot = { rolledBackAt: new Date().toISOString(), type: "file", files: [] };
      try {
        const raw = await fs.promises.readFile(snapshotPath, "utf8");
        const existing = JSON.parse(raw);
        if (Array.isArray(existing.files)) snapshot = existing;
      } catch {
        // no existing snapshot
      }
      if (!snapshot.files.includes(filename)) snapshot.files.push(filename);
      snapshot.rolledBackAt = new Date().toISOString();
      await fs.promises.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
    } catch {
      // best-effort snapshot
    }
    const dest = path.join(destDir, filename);
    await renameNoOverwrite(validatedFilePath, dest);

    const fileId = path.basename(validatedFilePath, path.extname(validatedFilePath));
    result.success = true;
    clearFileStage(fileId);
    // Returning the file to the inbox resolves all of its open RIP errors (same stem key).
    resolveRipErrorsByFile(fileId);

    const parsed = parsePrintFileName(path.basename(validatedFilePath));

    const qtyAffected = Number(reprint?.qtyAffected);
    const hasReprint = Number.isFinite(qtyAffected) && qtyAffected > 0;

    if (reason) {
      const fabric = parsed?.material ?? null;
      const materialType = fabric ? getMaterialType(fabric) : "Unknown";
      // Waste meters reflect the affected quantity when a reprint qty was
      // registered (LM: qtyAffected is meters → height; others: piece count → qty)
      const forLength = parsed
        ? hasReprint
          ? (parsed.printTypeCode === "LM"
              ? { ...parsed, materialType, height: qtyAffected * 1000 }
              : { ...parsed, materialType, qty: qtyAffected })
          : { ...parsed, materialType }
        : null;
      const metersResult = forLength
        ? estimatePrintLength(
            [forLength],
            { globals: getCachedGlobals(), fabrics: getCachedFabrics() },
          )
        : null;
      insertRollbackReason({
        id: crypto.randomUUID(),
        fileId,
        batchPath: validatedBatchPath,
        reasonCode: reason.code,
        reasonLabel: reason.label,
        workstation: getSettings().workstationName,
        orderId: parsed?.orderId ?? null,
        customer: parsed?.customerName ?? null,
        fabric,
        process: getMaterialType(fabric),
        printType: parsed?.printTypeCode ?? null,
        meters: metersResult?.fixedTotalLengthM ?? null,
      });
    }

    if (hasReprint) {
      const qtyOriginal = Number(reprint?.qtyOriginal);
      insertReprintRequest({
        id: crypto.randomUUID(),
        fileId,
        batchPath: validatedBatchPath,
        printType: parsed?.printTypeCode ?? null,
        qtyAffected,
        qtyOriginal: Number.isFinite(qtyOriginal) && qtyOriginal > 0 ? qtyOriginal : null,
        workstation: getSettings().workstationName,
      });
    }
  } catch (err) {
    result.errors = [toError(err, err.title || "File rollback failed")];
  }

  return result;
};

export const deleteBatchFolder = async (batchPath) => {
  const result = { success: false, errors: [] };

  try {
    const validatedBatchPath = await assertStorageFilePath(batchPath, {
      stage: "validate",
      title: "Invalid batch path",
      allowDirectory: true,
    });

    const meta = parseBatchFolderName(path.basename(validatedBatchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const entries = await fs.promises.readdir(validatedBatchPath, { withFileTypes: true });
    const hasPdfs = entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"));
    if (hasPdfs) {
      throw Object.assign(new Error("Batch folder still contains PDF files."), {
        code: "ENOTEMPTY",
        title: "Cannot delete non-empty batch",
      });
    }

    await fs.promises.rm(validatedBatchPath, { recursive: true, force: true });
    result.success = true;
  } catch (err) {
    result.errors = [toError(err, err.title || "Delete batch failed")];
  }

  return result;
};

export const regenerateXmlForBatch = async (batchPath) => {
  const result = { success: false, errors: [] };

  try {
    const validatedBatchPath = await assertStorageFilePath(batchPath, {
      stage: "validate",
      title: "Invalid batch path",
      allowDirectory: true,
    });

    const meta = parseBatchFolderName(path.basename(validatedBatchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const entries = await fs.promises.readdir(validatedBatchPath, { withFileTypes: true });
    const pdfs = entries.filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".pdf"));

    if (pdfs.length === 0) {
      throw Object.assign(new Error("No PDF files found in batch folder."), {
        code: "ENOENT",
        title: "No files to regenerate XML for",
      });
    }

    let batchOverrides = {};
    try {
      const raw = await fs.promises.readFile(path.join(validatedBatchPath, "_batch_info.json"), "utf8");
      const info = JSON.parse(raw);
      batchOverrides = info.overrides ?? {};
    } catch {
      // no _batch_info.json or no overrides field — safe to ignore
    }

    const batchItems = pdfs
      .map((pdf) => {
        const fullPath = path.join(validatedBatchPath, pdf.name);
        const parsed = parsePrintFileName(pdf.name, { fullPath, dir: validatedBatchPath });
        const materialType = getMaterialType(parsed?.material);
        const stem = path.parse(pdf.name).name;
        // Effective printed amount via the SINGLE shape gate (new {printed} +
        // legacy defensively) — same overlay readSingleBatch uses, so regenerate
        // reproduces the amount that was actually printed, not the parsed original.
        const prov = normalizeOverrideEntry(batchOverrides[stem]);
        return {
          file: { name: pdf.name, fullPath },
          printGroup: meta.group,
          printer: meta.printer,
          materialType,
          ...(parsed || {}),
          ...(prov?.printed?.qty != null ? { qty: prov.printed.qty } : {}),
          ...(prov?.printed?.meters != null ? { height: Math.round(prov.printed.meters * 1000) } : {}),
        };
      })
      .filter((item) => item.printTypeCode && item.printTypeCode !== "UNKNOWN");

    if (batchItems.length === 0) {
      throw Object.assign(new Error("Could not parse any PDF files in the batch."), {
        code: "EINVAL",
        title: "XML regeneration failed",
      });
    }

    const dayFolder = path.basename(path.dirname(validatedBatchPath));
    const batchId = `${dayFolder}/${path.basename(validatedBatchPath)}`;

    const xmlResult = await submitBatchToPrintFactory(batchItems, batchId, validatedBatchPath);
    if (!xmlResult.success) {
      return { ...result, errors: xmlResult.errors };
    }

    result.success = true;
  } catch (err) {
    result.errors = [toError(err, err.title || "XML regeneration failed")];
  }

  return result;
};
