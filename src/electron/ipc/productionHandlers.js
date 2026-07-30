import path from "path";
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
  getOpenReprintRequests,
  getOpenReprintRequestsByFileIds,
} from "../helpers/db.js";
import { getSettings } from "../helpers/getSettings.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { printBatchLabel } from "../helpers/labelPrinter.js";
import { PRODUCTION_STAGE } from "../../shared/constants.js";

// TODO(debt): this is the FIFTH local copy of getPrintedRootPath — the others live
// in readPrintedFolder.js, index.js, createBatch.js (and a hand-rolled variant in
// createXML.js). Extracting one shared helper into getRootPath.js is a separate
// refactor commit; duplicating here deliberately keeps this fix single-purpose.
const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

const PRINTED_SEGMENT = "PRINTED";

// file_stages.batch_path is an ABSOLUTE path written by whichever station ran the
// submit, so historical rows hold the same directory under a foreign spelling of the
// shared root (mapped drive letter vs UNC). Production hands that string straight to
// the file IPC, where assertStorageFilePath measures it against THIS station's
// storagePath and rejects the foreign form with ERR_PATH_NOT_ALLOWED. BatchHistory
// never hits this because it rebuilds every path locally — this function does the
// same for Production: keep the day + batch folder names, re-root them here.
//
// Pure, total, and never throws: anything it cannot confidently rewrite is returned
// UNCHANGED, so a surprising shape degrades to today's behaviour instead of pointing
// a file operation somewhere new. The guard in validateStoragePath.js is untouched.
export const toLocalBatchPath = (batchPath) => {
  if (typeof batchPath !== "string" || batchPath.trim() === "") return batchPath;

  // Tolerate a trailing separator; every fallback below still returns the ORIGINAL.
  const segments = batchPath.replace(/[\\/]+$/, "").split(/[/\\]/);

  // "The last PRINTED segment leaving exactly two segments behind it" has at most one
  // candidate — index length-3 — so the search collapses to a single lookup.
  const i = segments.length - 3;
  if (i < 0) return batchPath;

  // Full-segment equality, NOT startsWith/includes: the batch folder itself is named
  // PRINTED_HHMMSS-GROUP-PRINTER, so a loose match would latch onto the wrong segment
  // and re-root the path one level too deep.
  if (segments[i].toUpperCase() !== PRINTED_SEGMENT) return batchPath;

  const [day, batch] = segments.slice(i + 1);
  if (!day || !batch) return batchPath;
  // Never let a traversal segment through path.join — it would escape the root the
  // guard is about to check against.
  if (day === ".." || batch === "..") return batchPath;

  return path.join(getPrintedRootPath(), day, batch);
};

// Re-root every row's batch_path on the local storage root. Applied on EVERY return
// path (getAll/getByBatch/getAfter) so the renderer never sees a foreign format —
// missing one would leave polling free to overwrite normalized rows with raw ones.
const withLocalBatchPath = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  return rows.map((r) => {
    const local = toLocalBatchPath(r.batch_path);
    return local === r.batch_path ? r : { ...r, batch_path: local };
  });
};

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
      return { success: true, data: withReprint(withLocalBatchPath(getFileStagesByBatch(batchPath))) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:getAll", () => {
    try {
      return { success: true, data: withReprint(withLocalBatchPath(getAllFileStages())) };
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
      return { success: true, updated: result.updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stage:setSewingReceived", (_event, { fileId, expectedStage }) => {
    try {
      const { workstationName } = getSettings();
      const result = setSewingReceived(fileId, workstationName, expectedStage ?? null);
      if (!result) return { success: false, error: "DB unavailable" };
      // Receive from sewing now lands directly in "packed", so it is the entry
      // point that completes any open reprint request for the file.
      if (result.updated) fulfillReprintRequests(fileId);
      return { success: true, updated: result.updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("label:printBatch", (_event, data) => {
    return printBatchLabel(data);
  });

  ipcMain.handle("stage:getAfter", (_event, since) => {
    try {
      return { success: true, data: withReprint(withLocalBatchPath(getFileStagesAfter(since))) };
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

  // Open reprint requests (fulfilled_at IS NULL AND superseded_at IS NULL) across all
  // files — used by the print-view OverviewPanel for a global "Reprints" count. Returns
  // rows (not just a count) so the renderer can derive .length and stay flexible.
  ipcMain.handle("reprint:getOpen", () => {
    try {
      return { success: true, data: getOpenReprintRequests() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
