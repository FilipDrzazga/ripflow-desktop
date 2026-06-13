import { ipcMain } from "electron";
import {
  getFileStagesByBatch,
  getAllFileStages,
  getFileStagesAfter,
  advanceFileStage,
  clearFileStage,
  clearFileStagesByBatch,
  clearAllFileStages,
  setSewingSent,
  setSewingReceived,
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
      if (!result) return { success: false, error: "DB unavailable" };
      // Reaching "packed" completes any open reprint request for the file
      if (result.updated && newStage === PRODUCTION_STAGE.PACKED) {
        fulfillReprintRequests(fileId);
      }
      return { success: true, updated: result.updated };
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
      const result = setSewingSent(fileId, workstationName, expectedStage ?? null, sewingCompany ?? null);
      if (!result) return { success: false, error: "DB unavailable" };
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:setSewingReceived", (_event, { fileId, expectedStage }) => {
    try {
      const { workstationName } = getSettings();
      const result = setSewingReceived(fileId, workstationName, expectedStage ?? null);
      if (!result) return { success: false, error: "DB unavailable" };
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
}
