import { app } from "electron";
import { join } from "path";
import Database from "better-sqlite3";

let db = null;
let stmtInsert = null;
let stmtGetAll = null;
let stmtClear = null;
let stmtHoldFile = null;
let stmtUnholdFile = null;
let stmtGetHeldFiles = null;

export const initDb = () => {
  try {
    const dbPath = join(app.getPath("userData"), "ripflow.db");
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        type TEXT,
        stage TEXT,
        code TEXT,
        message TEXT,
        detail TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS held_files (
        file_id TEXT PRIMARY KEY
      )
    `);

    stmtInsert = db.prepare(
      "INSERT OR IGNORE INTO logs (id, timestamp, type, stage, code, message, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetAll = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC");
    stmtClear = db.prepare("DELETE FROM logs");
    stmtHoldFile = db.prepare("INSERT OR IGNORE INTO held_files (file_id) VALUES (?)");
    stmtUnholdFile = db.prepare("DELETE FROM held_files WHERE file_id = ?");
    stmtGetHeldFiles = db.prepare("SELECT file_id FROM held_files");
  } catch {
    db = null;
    stmtInsert = null;
    stmtGetAll = null;
    stmtClear = null;
    stmtHoldFile = null;
    stmtUnholdFile = null;
    stmtGetHeldFiles = null;
  }
};

export const insertLog = (log) => {
  if (!stmtInsert) return;
  try {
    stmtInsert.run(
      log.id,
      log.timestamp,
      log.type,
      log.stage,
      log.code,
      log.message,
      log.detail != null ? JSON.stringify(log.detail) : null,
    );
  } catch {}
};

export const getAllLogs = () => {
  if (!stmtGetAll) return [];
  try {
    return stmtGetAll.all().map((row) => ({
      ...row,
      detail: row.detail ? JSON.parse(row.detail) : null,
    }));
  } catch {
    return [];
  }
};

export const clearAllLogs = () => {
  if (!stmtClear) return;
  try {
    stmtClear.run();
  } catch {}
};

export const holdFile = (fileId) => {
  if (!stmtHoldFile) return;
  try {
    stmtHoldFile.run(fileId);
  } catch {}
};

export const unholdFile = (fileId) => {
  if (!stmtUnholdFile) return;
  try {
    stmtUnholdFile.run(fileId);
  } catch {}
};

export const getHeldFiles = () => {
  if (!stmtGetHeldFiles) return new Set();
  try {
    return new Set(stmtGetHeldFiles.all().map((r) => r.file_id));
  } catch {
    return new Set();
  }
};
