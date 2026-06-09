import fs from "fs";
import path from "path";
import { createBatch, rollbackBatch } from "./createBatch.js";
import { submitBatchToPrintFactory } from "./createXML.js";
import { toIpcError } from "../helpers/ipcError.js";
import { insertFileStage } from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { printBatchLabel } from "../helpers/labelPrinter.js";

const toSubmitBatchError = (error, stage, fallbackTitle = "Batch submission failed") =>
  toIpcError(error, stage, fallbackTitle);

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

    const batchPath = createdBatchResult.finalBatchFolderPath;
    const batchName = path.basename(batchPath);
    const { workstationName } = getSettings();
    const now = new Date().toISOString();

    // fire-and-forget — label print must not delay the submit response
    const printerMatch = batchName.match(/-(DGEN|YOKO|YUMI)$/i);
    const batchPrinter = printerMatch ? printerMatch[1].toUpperCase() : "UNKNOWN";
    printBatchLabel({
      batchPath,
      batchName,
      printer: batchPrinter,
      fileCount: batch.length,
      material: batch.length === 1 ? (batch[0].material ?? "Mixed") : "Mixed",
    }).catch((err) => console.error("[submitBatch] printBatchLabel failed:", err));

    for (const item of batch) {
      insertFileStage({
        file_id:       path.parse(item.file.name).name,
        batch_path:    batchPath,
        print_type:    item.printTypeCode ?? null,
        customer_name: item.customerName ?? null,
        order_id:      item.orderId ?? null,
        material:      item.material ?? null,
        stage:         "printed",
        prev_stage:    null,
        updated_at:    now,
        updated_by:    workstationName ?? null,
        sewing_sent_at:     null,
        sewing_received_at: null,
      });
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
