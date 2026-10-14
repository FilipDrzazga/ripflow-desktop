import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parseRipErrorXml } from "../helpers/parseRipErrorXml.js";
import {
  insertRipError,
  getOpenRipErrors,
  resolveRipErrorsByFile,
  resolveRipErrorsByJob,
  ripErrorJobHasOtherFiles,
} from "../helpers/db.js";
import { toIpcError } from "../helpers/ipcError.js";
import { getFolder } from "../helpers/shopProfile.js";
import { createLogOnce } from "../helpers/logOnce.js";

// The scan runs every 30 s (App.jsx poll) - one warning per hour is enough.
const logOnce = createLogOnce();

// Scan {storagePath}\<folders.ripError>\ (Alex: AUTOMATION_WORKFLOW_ERROR), parse each *.xml
// (ignore the paired .tif), persist any error rows (INSERT OR IGNORE dedups the
// (job_guid, file_id) pair), then return all open errors. One bad xml can't sink the scan -
// each file is isolated in its own try/catch.
//
// The folder name is shop-profile data since ETAP 2d-3 (PrintFactory's export folder is
// configured per shop; it was renamed once already). It is resolved HERE, not in
// getRootPath.js: db.js imports getRootPath.js, so getRootPath.js importing shopProfile.js
// (which imports db.js) would be a cycle. No usable name (profile unreadable, key missing,
// not one plain folder name) -> the scan reads nothing and answers exactly like a folder
// that does not exist yet: the open errors already in the DB, so no badge disappears.
export const scanRipErrors = async () => {
  const folder = getFolder("ripError");
  if (folder === null) {
    if (logOnce("ripError-folder")) {
      console.warn("[ripErrors] no RIP-error folder in the shop profile (folders.ripError) - scan skipped");
    }
    return { success: true, data: getOpenRipErrors() };
  }
  const dir = path.join(getStorageRootPath(), folder);

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
      const rows = parseRipErrorXml(xml).filter((row) => row.jobGuid && row.fileId); // both keys required
      if (rows.length === 0) continue;
      // One xml = one job (the rows share its JobGUID). Already read the other way (another
      // file set, e.g. by a build before the per-file reading of a batch failure) -> leave it.
      if (ripErrorJobHasOtherFiles(rows[0].jobGuid, rows.map((row) => row.fileId))) continue;
      const detectedAt = new Date().toISOString();
      for (const row of rows) insertRipError({ ...row, detectedAt });
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
  ipcMain.handle("rip-errors:resolve", (_event, fileId) =>
    resolveOpenRows("rip-errors:resolve", fileId, "fileId", "INVALID_FILE_ID", resolveRipErrorsByFile),
  );

  // Manual resolve of a whole-batch failure (scope BATCH) - every file of the job at once, from
  // the badge on the batch header or on any of its files. Same contract as rip-errors:resolve.
  ipcMain.handle("rip-errors:resolveJob", (_event, jobGuid) =>
    resolveOpenRows("rip-errors:resolveJob", jobGuid, "jobGuid", "INVALID_JOB_GUID", resolveRipErrorsByJob),
  );
}

// The two manual resolves differ only in the key. success comes from the runWrite boolean (see
// above), never from the absence of an exception.
const resolveOpenRows = (stage, key, keyName, invalidCode, resolve) => {
  try {
    if (typeof key !== "string" || key.trim() === "") {
      throw Object.assign(new Error(`${keyName} is required.`), { code: invalidCode });
    }
    const ok = resolve(key);
    if (!ok) {
      throw Object.assign(new Error("Database write failed — RIP error not resolved."), {
        code: "DB_WRITE_FAILED",
      });
    }
    return { success: true };
  } catch (err) {
    console.error(`[ripErrors] ${stage} failed:`, err);
    return {
      success: false,
      error: toIpcError(err, stage, "Resolve RIP error failed"),
    };
  }
};
