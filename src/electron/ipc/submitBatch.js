import fs from "fs";
import { createBatch, rollbackBatch } from "./createBatch.js";
import { submitBatchToPrintFactory } from "./createXML.js";

const toSubmitBatchError = (error, stage, fallbackTitle = "Batch submission failed") => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
    title: error.title || fallbackTitle,
  };
};

const cleanupXmlFile = async (xmlPath) => {
  if (typeof xmlPath !== "string" || xmlPath.trim() === "") {
    return;
  }

  try {
    await fs.promises.unlink(xmlPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

export const submitBatch = async (batch) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    batchId: null,
    finalXmlPath: null,
    rollbackPerformed: false,
  };

  let createdBatchResult = null;

  try {
    createdBatchResult = await createBatch(batch);

    if (!createdBatchResult.success) {
      return {
        ...result,
        errors: createdBatchResult.errors,
        warnings: createdBatchResult.warnings,
      };
    }

    result.batchId = createdBatchResult.batchId;

    const xmlResult = await submitBatchToPrintFactory(batch, createdBatchResult.batchId, createdBatchResult.finalBatchFolderPath);

    if (!xmlResult.success) {
      const rollbackResult = await rollbackBatch(batch, createdBatchResult.batchId);
      const rollbackErrors = rollbackResult.errors || [];

      try {
        await cleanupXmlFile(xmlResult.finalXmlPath);
      } catch (cleanupError) {
        result.warnings.push(`Failed to clean up XML file: ${cleanupError.message}`);
      }

      return {
        ...result,
        errors: [...(xmlResult.errors || []), ...rollbackErrors],
        warnings: [
          ...createdBatchResult.warnings,
          ...result.warnings,
          ...rollbackResult.warnings,
        ],
        rollbackPerformed: rollbackResult.rollbackPerformed,
      };
    }

    return {
      ...result,
      success: true,
      batchId: createdBatchResult.batchId,
      finalXmlPath: xmlResult.finalXmlPath,
      localXmlPath: xmlResult.localXmlPath,
      warnings: [...createdBatchResult.warnings, ...(xmlResult.warnings || [])],
    };
  } catch (error) {
    result.errors = [toSubmitBatchError(error, "submit")];
    return result;
  }
};
