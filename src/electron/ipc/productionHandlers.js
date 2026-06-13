import { ipcMain } from "electron";
import {
  getFileStage,
  getFileStagesByBatch,
  getAllFileStages,
  getFileStagesAfter,
  advanceFileStage,
  rejectFileStage,
  overrideFileStage,
  clearFileStage,
  clearFileStagesByBatch,
  clearAllFileStages,
  setSewingSent,
  setSewingReceived,
  insertRollbackReason,
  getAllStageHistory,
  fulfillReprintRequests,
} from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { printBatchLabel } from "../helpers/labelPrinter.js";
import { PRODUCTION_STAGE } from "../../shared/constants.js";

export function registerProductionHandlers() {
  ipcMain.handle("stage:getByBatch", (_event, batchPath) => {
    try {
      return { success: true, data: getFileStagesByBatch(batchPath) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:getAll", () => {
    try {
      return { success: true, data: getAllFileStages() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:advance", (_event, { fileId, newStage, expectedStage }) => {
    try {
      const { workstationName } = getSettings();
      const result = advanceFileStage(fileId, newStage, workstationName, expectedStage ?? null);
      // Reaching "packed" completes any open reprint request for the file
      if ((result?.updated ?? true) && newStage === PRODUCTION_STAGE.PACKED) {
        fulfillReprintRequests(fileId);
      }
      return { success: true, updated: result?.updated ?? true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:reject", (_event, { fileId, reason, expectedStage }) => {
    try {
      const { workstationName } = getSettings();
      const result = rejectFileStage(fileId, workstationName, expectedStage ?? null);
      if (reason?.code && result?.updated) {
        const row = getFileStage(fileId);
        insertRollbackReason({
          id: crypto.randomUUID(),
          fileId,
          batchPath: row?.batch_path ?? "",
          reasonCode: reason.code,
          reasonLabel: reason.label,
          workstation: workstationName,
          orderId: row?.order_id ?? null,
          customer: row?.customer_name ?? null,
          fabric: row?.material ?? null,
          process: null,
          printType: row?.print_type ?? null,
          meters: null,
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:override", (_event, { fileId }) => {
    try {
      const { workstationName } = getSettings();
      overrideFileStage(fileId, workstationName);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:clearFile", (_event, fileId) => {
    try {
      clearFileStage(fileId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:clearBatch", (_event, batchPath) => {
    try {
      clearFileStagesByBatch(batchPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:setSewingSent", (_event, { fileId, expectedStage, sewingCompany }) => {
    try {
      const { workstationName } = getSettings();
      setSewingSent(fileId, workstationName, expectedStage ?? null, sewingCompany ?? null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:setSewingReceived", (_event, { fileId, expectedStage }) => {
    try {
      const { workstationName } = getSettings();
      setSewingReceived(fileId, workstationName, expectedStage ?? null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("label:printBatch", (_event, data) => {
    return printBatchLabel(data);
  });

  ipcMain.handle("stage:getAfter", (_event, since) => {
    try {
      return { success: true, data: getFileStagesAfter(since) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:clearAll", () => {
    try {
      clearAllFileStages();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:getAllHistory", () => {
    try {
      return { success: true, data: getAllStageHistory() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:insertRollbackReason", (_event, { batchPath, fileId, reason }) => {
    try {
      const { workstationName } = getSettings();
      insertRollbackReason({
        id: crypto.randomUUID(),
        fileId: fileId ?? null,
        batchPath: batchPath ?? "",
        reasonCode: reason?.code ?? "OTHER",
        reasonLabel: reason?.label ?? "",
        workstation: workstationName,
        orderId: null,
        customer: null,
        fabric: null,
        process: null,
        printType: null,
        meters: null,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
