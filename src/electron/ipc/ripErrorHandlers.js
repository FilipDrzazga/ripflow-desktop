import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parseRipErrorXml } from "../helpers/parseRipErrorXml.js";
import { insertRipError, getOpenRipErrors } from "../helpers/db.js";

// WORKFLOW_ERROR/ is a sibling of PRINTED/ under storagePath (derived, never hardcoded).
const getWorkflowErrorPath = () => path.join(getStorageRootPath(), "WORKFLOW_ERROR");

// Scan WORKFLOW_ERROR/, parse each *.xml (ignore the paired .tif), persist any error rows
// (INSERT OR IGNORE dedups already-seen job_guid), then return all open errors. One bad xml
// can't sink the scan — each file is isolated in its own try/catch.
export const scanRipErrors = async () => {
  const dir = getWorkflowErrorPath();

  let entries;
  try {
    entries = await fs.promises.readdir(dir);
  } catch (err) {
    if (err.code === "ENOENT") return { success: true, data: getOpenRipErrors() }; // folder not created yet
    console.error("[ripErrors] scan readdir failed:", err);
    return { success: false, error: err.message };
  }

  const xmlFiles = entries.filter((name) => name.toLowerCase().endsWith(".xml"));
  for (const fileName of xmlFiles) {
    try {
      const xml = await fs.promises.readFile(path.join(dir, fileName), "utf8");
      const rows = parseRipErrorXml(xml);
      const detectedAt = new Date().toISOString();
      for (const row of rows) {
        if (!row.jobGuid || !row.fileId) continue; // both keys required
        insertRipError({ ...row, detectedAt });
      }
    } catch (err) {
      console.error(`[ripErrors] failed to process ${fileName}:`, err);
    }
  }

  return { success: true, data: getOpenRipErrors() };
};

export function registerRipErrorHandlers() {
  ipcMain.handle("rip-errors:scan", () => scanRipErrors());

  ipcMain.handle("rip-errors:get", () => {
    try {
      return { success: true, data: getOpenRipErrors() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
