import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { submitBatchToPrintFactory } from "./createXML.js";
import { parseBatchFolderName } from "./readPrintedFolder.js";

const toError = (err, title = "Operation failed") => ({
  code: err.code || "UNKNOWN_ERROR",
  message: err.message || "An unknown error occurred.",
  stage: "unknown",
  type: "Error",
  title,
});

export const rollbackBatchFromHistory = async (batchPath) => {
  const result = { success: false, errors: [], restoredFiles: [] };

  try {
    const meta = parseBatchFolderName(path.basename(batchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const destDir = path.join(getStorageRootPath(), meta.group);
    await fs.promises.mkdir(destDir, { recursive: true });

    const entries = await fs.promises.readdir(batchPath, { withFileTypes: true });
    for (const f of entries) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith(".pdf")) continue;
      const src = path.join(batchPath, f.name);
      const dest = path.join(destDir, f.name);
      await fs.promises.rename(src, dest);
      result.restoredFiles.push(dest);
    }

    result.success = true;
  } catch (err) {
    result.errors = [toError(err, "Rollback failed")];
  }

  return result;
};

export const rollbackFileFromHistory = async (filePath, batchPath) => {
  const result = { success: false, errors: [] };

  try {
    const meta = parseBatchFolderName(path.basename(batchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const destDir = path.join(getStorageRootPath(), meta.group);
    await fs.promises.mkdir(destDir, { recursive: true });

    const dest = path.join(destDir, path.basename(filePath));
    await fs.promises.rename(filePath, dest);

    result.success = true;
  } catch (err) {
    result.errors = [toError(err, "File rollback failed")];
  }

  return result;
};

export const deleteBatchFolder = async (batchPath) => {
  const result = { success: false, errors: [] };

  try {
    const meta = parseBatchFolderName(path.basename(batchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const entries = await fs.promises.readdir(batchPath, { withFileTypes: true });
    const hasPdfs = entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"));
    if (hasPdfs) {
      throw Object.assign(new Error("Batch folder still contains PDF files."), {
        code: "ENOTEMPTY",
        title: "Cannot delete non-empty batch",
      });
    }

    await fs.promises.rm(batchPath, { recursive: true, force: true });
    result.success = true;
  } catch (err) {
    result.errors = [toError(err, err.title || "Delete batch failed")];
  }

  return result;
};

export const regenerateXmlForBatch = async (batchPath) => {
  const result = { success: false, errors: [] };

  try {
    const meta = parseBatchFolderName(path.basename(batchPath));
    if (!meta) {
      throw Object.assign(new Error("Invalid batch folder name."), { code: "EINVAL" });
    }

    const entries = await fs.promises.readdir(batchPath, { withFileTypes: true });
    const pdfs = entries.filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".pdf"));

    if (pdfs.length === 0) {
      throw Object.assign(new Error("No PDF files found in batch folder."), {
        code: "ENOENT",
        title: "No files to regenerate XML for",
      });
    }

    const batchItems = pdfs
      .map((pdf) => {
        const fullPath = path.join(batchPath, pdf.name);
        const parsed = parsePrintFileName(pdf.name, { fullPath, dir: batchPath });
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

    const dayFolder = path.basename(path.dirname(batchPath));
    const batchId = `${dayFolder}/${path.basename(batchPath)}`;

    const xmlResult = await submitBatchToPrintFactory(batchItems, batchId, batchPath);
    if (!xmlResult.success) {
      return { ...result, errors: xmlResult.errors };
    }

    result.success = true;
  } catch (err) {
    result.errors = [toError(err, "XML regeneration failed")];
  }

  return result;
};
