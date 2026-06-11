import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";
import { toIpcError } from "../helpers/ipcError.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { submitBatchToPrintFactory } from "./createXML.js";
import { parseBatchFolderName } from "./readPrintedFolder.js";
import { insertRollbackReason, clearFileStagesByBatch, clearFileStage } from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { GROUP_NAME_OVERRIDES_REVERSE } from "../helpers/createBatchIds.js";
import { getCachedFabrics, getCachedGlobals } from "../helpers/fabricCache.js";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";

const toError = (err, title = "Operation failed") => toIpcError(err, "unknown", title);

const resolveOriginalGroup = async (batchPath, shortGroup) => {
  try {
    const raw = await fs.promises.readFile(path.join(batchPath, "_batch_info.json"), "utf8");
    const info = JSON.parse(raw);
    if (info.originalGroup) return info.originalGroup;
  } catch {
    // no metadata file
  }
  return GROUP_NAME_OVERRIDES_REVERSE[shortGroup] ?? shortGroup;
};

export const rollbackBatchFromHistory = async ({ batchPath, reason } = {}) => {
  const result = { success: false, errors: [], restoredFiles: [] };

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

    const originalGroup = await resolveOriginalGroup(validatedBatchPath, meta.group);
    const destDir = path.join(getStorageRootPath(), originalGroup);
    await fs.promises.mkdir(destDir, { recursive: true });

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
    for (const f of entries) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith(".pdf")) continue;
      const src = path.join(validatedBatchPath, f.name);
      const dest = path.join(destDir, f.name);
      await fs.promises.rename(src, dest);
      result.restoredFiles.push(dest);
    }

    result.success = true;
    clearFileStagesByBatch(validatedBatchPath);

    if (reason) {
      const workstation = getSettings().workstationName;
      for (const pdfName of pdfNames) {
        const fileId = pdfName.replace(/\.[^.]+$/, "");
        const p = parsePrintFileName(pdfName);
        const parsed = p ? { ...p, materialType: p.material ? getMaterialType(p.material) : "Unknown" } : null;
        const fileFabric = parsed?.material ?? null;
        const metersResult = parsed
          ? estimatePrintLength([parsed], { globals: getCachedGlobals(), fabrics: getCachedFabrics() })
          : null;
        insertRollbackReason({
          id: crypto.randomUUID(),
          fileId,
          batchPath: validatedBatchPath,
          reasonCode: reason.code,
          reasonLabel: reason.label,
          workstation,
          orderId: parsed?.orderId ?? null,
          customer: parsed?.customerName ?? null,
          fabric: fileFabric,
          process: fileFabric ? getMaterialType(fileFabric) : null,
          printType: parsed?.printTypeCode ?? null,
          meters: metersResult?.fixedTotalLengthM ?? null,
        });
      }
    }
  } catch (err) {
    result.errors = [toError(err, err.title || "Rollback failed")];
  }

  return result;
};

export const rollbackFileFromHistory = async ({ filePath, batchPath, reason } = {}) => {
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

    const originalGroup = await resolveOriginalGroup(validatedBatchPath, meta.group);
    const destDir = path.join(getStorageRootPath(), originalGroup);
    await fs.promises.mkdir(destDir, { recursive: true });

    const filename = path.basename(validatedFilePath);
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
    await fs.promises.rename(validatedFilePath, dest);

    const fileId = path.basename(validatedFilePath, path.extname(validatedFilePath));
    result.success = true;
    clearFileStage(fileId);

    if (reason) {
      const parsed = parsePrintFileName(path.basename(validatedFilePath));
      const fabric = parsed?.material ?? null;
      const materialType = fabric ? getMaterialType(fabric) : "Unknown";
      const metersResult = parsed
        ? estimatePrintLength(
            [{ ...parsed, materialType }],
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
        process: fabric ? getMaterialType(fabric) : null,
        printType: parsed?.printTypeCode ?? null,
        meters: metersResult?.fixedTotalLengthM ?? null,
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

    const batchItems = pdfs
      .map((pdf) => {
        const fullPath = path.join(validatedBatchPath, pdf.name);
        const parsed = parsePrintFileName(pdf.name, { fullPath, dir: validatedBatchPath });
        const materialType = getMaterialType(parsed?.material);
        return {
          file: { name: pdf.name, fullPath },
          printGroup: meta.group,
          printer: meta.printer,
          materialType,
          ...(parsed || {}),
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
