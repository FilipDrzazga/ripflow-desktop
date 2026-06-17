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
  getOpenReprintRequestsByFileIds,
} from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { printBatchLabel } from "../helpers/labelPrinter.js";
import { PRODUCTION_STAGE } from "../../shared/constants.js";

// Attach open reprint-request quantities to stage rows so Production can show a
// "Reprint" badge. Matched by file_id (file_stages.file_id === reprint_requests.file_id
// === filename stem). Only open requests are returned, so once a file is advanced
// to "packed" (fulfillReprintRequests) the enrichment naturally stops. Applied on
// EVERY return path (getAll/getAfter/getByBatch) so polling keeps the badge alive.
const withReprint = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const reqs = getOpenReprintRequestsByFileIds(rows.map((r) => r.file_id));
  if (reqs.length === 0) return rows;
  const byId = new Map(reqs.map((r) => [r.file_id, r]));
  return rows.map((r) => {
    const req = byId.get(r.file_id);
    if (!req) return r;
    return { ...r, reprint_qty: req.qty_affected, reprint_original: req.qty_original };
  });
};

export function registerProductionHandlers() {
  ipcMain.handle("stage:getByBatch", (_event, batchPath) => {
    try {
      return { success: true, data: withReprint(getFileStagesByBatch(batchPath)) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:getAll", () => {
    try {
      return { success: true, data: withReprint(getAllFileStages()) };
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
      return { success: true, data: withReprint(getFileStagesAfter(since)) };
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
