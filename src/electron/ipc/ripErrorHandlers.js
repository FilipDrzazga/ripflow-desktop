import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { getRipErrorRootPath } from "../helpers/getRootPath.js";
import { parseRipErrorXml } from "../helpers/parseRipErrorXml.js";
import { insertRipError, getOpenRipErrors, resolveRipErrorsByFile } from "../helpers/db.js";
import { toIpcError } from "../helpers/ipcError.js";

// Scan AUTOMATION_WORKFLOW_ERROR/, parse each *.xml (ignore the paired .tif), persist any
// error rows (INSERT OR IGNORE dedups the (job_guid, file_id) pair), then return all open
// errors. One bad xml can't sink the scan — each file is isolated in its own try/catch.
export const scanRipErrors = async () => {
  const dir = getRipErrorRootPath();

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

  // Manual resolve from the UI — the second resolve path next to rollback. Resolves ALL open
  // rows for the file_id (same semantics as the rollback path). resolveRipErrorsByFile goes
  // through runWrite, which NEVER throws: it returns false when the DB is unavailable or the
  // write fails. So success is taken from that boolean — otherwise a dead DB would report
  // success and the renderer would optimistically drop a badge that is still open in the DB.
  ipcMain.handle("rip-errors:resolve", (_event, fileId) => {
    try {
      if (typeof fileId !== "string" || fileId.trim() === "") {
        throw Object.assign(new Error("fileId is required."), { code: "INVALID_FILE_ID" });
      }
      const ok = resolveRipErrorsByFile(fileId);
      if (!ok) {
        throw Object.assign(new Error("Database write failed — RIP error not resolved."), {
          code: "DB_WRITE_FAILED",
        });
      }
      return { success: true };
    } catch (err) {
      console.error("[ripErrors] resolve failed:", err);
      return {
        success: false,
        error: toIpcError(err, "rip-errors:resolve", "Resolve RIP error failed"),
      };
    }
  });
}
