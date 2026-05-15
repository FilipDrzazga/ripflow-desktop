import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";
import { toIpcError } from "../helpers/ipcError.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { submitBatchToPrintFactory } from "./createXML.js";
import { parseBatchFolderName } from "./readPrintedFolder.js";

const toError = (err, title = "Operation failed") => toIpcError(err, "unknown", title);

export const rollbackBatchFromHistory = async (batchPath) => {
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

    const destDir = path.join(getStorageRootPath(), meta.group);
    await fs.promises.mkdir(destDir, { recursive: true });

    const entries = await fs.promises.readdir(validatedBatchPath, { withFileTypes: true });
    for (const f of entries) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith(".pdf")) continue;
      const src = path.join(validatedBatchPath, f.name);
      const dest = path.join(destDir, f.name);
      await fs.promises.rename(src, dest);
      result.restoredFiles.push(dest);
    }

    result.success = true;
  } catch (err) {
    result.errors = [toError(err, err.title || "Rollback failed")];
  }

  return result;
};

export const rollbackFileFromHistory = async (filePath, batchPath) => {
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

    const destDir = path.join(getStorageRootPath(), meta.group);
    await fs.promises.mkdir(destDir, { recursive: true });

    const dest = path.join(destDir, path.basename(validatedFilePath));
    await fs.promises.rename(validatedFilePath, dest);

    result.success = true;
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
