import { join } from "path";
import Database from "better-sqlite3";
import { getStorageRootPath } from "./getRootPath.js";
import { getSettings } from "./getSettings.js";

let db = null;
let stmtInsert = null;
let stmtGetAll = null;
let stmtClear = null;
let stmtClearByWorkstation = null;
let stmtHoldFile = null;
let stmtUnholdFile = null;
let stmtGetHeldFiles = null;
let stmtInsertRollbackReason = null;
let stmtGetRollbackReasonsByBatch = null;
let stmtGetRollbackReasonsByFile = null;
let stmtClearRollbackReasons = null;

const PRINTER_RE = /-(DGEN|YOKO|YUMI)$/i;

export const initDb = () => {
  try {
    const dbPath = join(getStorageRootPath(), "ripflow.db");
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        type TEXT,
        stage TEXT,
        code TEXT,
        message TEXT,
        detail TEXT,
        workstation TEXT
      )
    `);

    try {
      db.exec("ALTER TABLE logs ADD COLUMN workstation TEXT");
    } catch {
      // column already exists in older databases — safe to ignore
    }

    // Migrate held_files: add workstation column if missing (per-PC holds)
    let heldFilesNeedsMigration = false;
    try {
      db.prepare("SELECT workstation FROM held_files LIMIT 0").all();
    } catch {
      heldFilesNeedsMigration = true;
    }
    if (heldFilesNeedsMigration) {
      const ws = getSettings().workstationName ?? "";
      const oldRows = (() => { try { return db.prepare("SELECT file_id FROM held_files").all(); } catch { return []; } })();
      db.exec("DROP TABLE IF EXISTS held_files");
      db.exec(`
        CREATE TABLE held_files (
          file_id     TEXT NOT NULL,
          workstation TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (file_id, workstation)
        )
      `);
      const migrateStmt = db.prepare("INSERT OR IGNORE INTO held_files (file_id, workstation) VALUES (?, ?)");
      for (const row of oldRows) migrateStmt.run(row.file_id, ws);
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS held_files (
          file_id     TEXT NOT NULL,
          workstation TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (file_id, workstation)
        )
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS rollback_reasons (
        id           TEXT PRIMARY KEY,
        file_id      TEXT,
        batch_path   TEXT,
        reason_code  TEXT,
        reason_label TEXT,
        workstation  TEXT,
        timestamp    TEXT,
        order_id     TEXT,
        customer     TEXT,
        fabric       TEXT,
        process      TEXT
      )
    `);

    stmtInsert = db.prepare(
      "INSERT OR IGNORE INTO logs (id, timestamp, type, stage, code, message, detail, workstation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetAll = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC");
    stmtClear = db.prepare("DELETE FROM logs");
    stmtClearByWorkstation = db.prepare("DELETE FROM logs WHERE workstation = ?");
    stmtHoldFile = db.prepare("INSERT OR IGNORE INTO held_files (file_id, workstation) VALUES (?, ?)");
    stmtUnholdFile = db.prepare("DELETE FROM held_files WHERE file_id = ? AND workstation = ?");
    stmtGetHeldFiles = db.prepare("SELECT file_id FROM held_files WHERE workstation = ?");
    stmtInsertRollbackReason = db.prepare(
      "INSERT OR REPLACE INTO rollback_reasons (id, file_id, batch_path, reason_code, reason_label, timestamp, workstation, order_id, customer, fabric, process) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetRollbackReasonsByBatch = db.prepare(
      "SELECT * FROM rollback_reasons WHERE batch_path = ? ORDER BY timestamp DESC",
    );
    stmtGetRollbackReasonsByFile = db.prepare(
      "SELECT * FROM rollback_reasons WHERE file_id = ? ORDER BY timestamp DESC LIMIT 1",
    );
    stmtClearRollbackReasons = db.prepare("DELETE FROM rollback_reasons");
  } catch (err) {
    console.error("[db] initDb failed:", err);
    db = null;
    stmtInsert = null;
    stmtGetAll = null;
    stmtClear = null;
    stmtClearByWorkstation = null;
    stmtHoldFile = null;
    stmtUnholdFile = null;
    stmtGetHeldFiles = null;
    stmtInsertRollbackReason = null;
    stmtGetRollbackReasonsByBatch = null;
    stmtGetRollbackReasonsByFile = null;
    stmtClearRollbackReasons = null;
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
      log.workstation ?? null,
    );
  } catch (err) {
    console.error("[db] insertLog failed:", err);
  }
};

export const getAllLogs = () => {
  if (!stmtGetAll) return [];
  try {
    return stmtGetAll.all().map((row) => ({
      ...row,
      detail: row.detail ? JSON.parse(row.detail) : null,
    }));
  } catch (err) {
    console.error("[db] getAllLogs failed:", err);
    return [];
  }
};

export const clearAllLogs = (workstation) => {
  if (workstation) {
    if (!stmtClearByWorkstation) return;
    try { stmtClearByWorkstation.run(workstation); } catch (err) { console.error("[db] clearAllLogs (by workstation) failed:", err); }
  } else {
    if (!stmtClear) return;
    try { stmtClear.run(); } catch (err) { console.error("[db] clearAllLogs failed:", err); }
  }
};

export const holdFile = (fileId, workstation = "") => {
  if (!stmtHoldFile) return;
  try {
    stmtHoldFile.run(fileId, workstation);
  } catch (err) {
    console.error("[db] holdFile failed:", err);
  }
};

export const unholdFile = (fileId, workstation = "") => {
  if (!stmtUnholdFile) return;
  try {
    stmtUnholdFile.run(fileId, workstation);
  } catch (err) {
    console.error("[db] unholdFile failed:", err);
  }
};

export const getHeldFiles = (workstation = "") => {
  if (!stmtGetHeldFiles) return new Set();
  try {
    return new Set(stmtGetHeldFiles.all(workstation).map((r) => r.file_id));
  } catch (err) {
    console.error("[db] getHeldFiles failed:", err);
    return new Set();
  }
};

export const insertRollbackReason = ({
  id,
  fileId,
  batchPath,
  reasonCode,
  reasonLabel,
  workstation,
  orderId,
  customer,
  fabric,
  process,
}) => {
  if (!stmtInsertRollbackReason) return;
  try {
    stmtInsertRollbackReason.run(
      id,
      fileId ?? null,
      batchPath,
      reasonCode,
      reasonLabel,
      new Date().toISOString(),
      workstation ?? null,
      orderId ?? null,
      customer ?? null,
      fabric ?? null,
      process ?? null,
    );
  } catch (err) {
    console.error("[db] insertRollbackReason failed:", err);
  }
};

export const getRollbackReasonsByBatch = (batchPath) => {
  if (!stmtGetRollbackReasonsByBatch) return [];
  try {
    return stmtGetRollbackReasonsByBatch.all(batchPath);
  } catch (err) {
    console.error("[db] getRollbackReasonsByBatch failed:", err);
    return [];
  }
};

export const clearAllRollbackReasons = () => {
  if (!stmtClearRollbackReasons) return;
  try { stmtClearRollbackReasons.run(); } catch (err) { console.error("[db] clearAllRollbackReasons failed:", err); }
};

export const getRollbackReasonsByFile = (fileId) => {
  if (!stmtGetRollbackReasonsByFile) return null;
  try {
    return stmtGetRollbackReasonsByFile.get(fileId) ?? null;
  } catch (err) {
    console.error("[db] getRollbackReasonsByFile failed:", err);
    return null;
  }
};

export const getRollbackStats = (since) => {
  if (!db) return { total: 0, byReason: [], byPrinter: [], byWorkstation: [], byProcess: [] };
  try {
    const rows = since
      ? db.prepare("SELECT * FROM rollback_reasons WHERE timestamp >= ?").all(since)
      : db.prepare("SELECT * FROM rollback_reasons").all();

    const reasonMap = new Map();
    const printerMap = new Map();
    const wsMap = new Map();
    const processMap = new Map();

    for (const row of rows) {
      const rk = row.reason_code;
      if (!reasonMap.has(rk)) {
        reasonMap.set(rk, { reason_code: rk, reason_label: row.reason_label, count: 0 });
      }
      reasonMap.get(rk).count++;

      const batchFolder = row.batch_path ? row.batch_path.split(/[/\\]/).pop() : "";
      const printerMatch = batchFolder.match(PRINTER_RE);
      const printer = printerMatch ? printerMatch[1].toUpperCase() : "UNKNOWN";
      printerMap.set(printer, (printerMap.get(printer) || 0) + 1);

      const ws = row.workstation || "Unknown";
      wsMap.set(ws, (wsMap.get(ws) || 0) + 1);

      const proc = row.process || "Unknown";
      processMap.set(proc, (processMap.get(proc) || 0) + 1);
    }

    return {
      total: rows.length,
      byReason: [...reasonMap.values()].sort((a, b) => b.count - a.count),
      byPrinter: [...printerMap.entries()]
        .map(([printer, count]) => ({ printer, count }))
        .sort((a, b) => b.count - a.count),
      byWorkstation: [...wsMap.entries()]
        .map(([workstation, count]) => ({ workstation, count }))
        .sort((a, b) => b.count - a.count),
      byProcess: [...processMap.entries()]
        .map(([process, count]) => ({ process, count }))
        .sort((a, b) => b.count - a.count),
    };
  } catch (err) {
    console.error("[db] getRollbackStats failed:", err);
    return { total: 0, byReason: [], byPrinter: [], byWorkstation: [], byProcess: [] };
  }
};

export const getRollbackDetails = (since) => {
  if (!db) return [];
  try {
    const rows = since
      ? db.prepare("SELECT * FROM rollback_reasons WHERE timestamp >= ? ORDER BY timestamp DESC").all(since)
      : db.prepare("SELECT * FROM rollback_reasons ORDER BY timestamp DESC").all();

    return rows.map((row) => {
      const batchFolder = row.batch_path ? row.batch_path.split(/[/\\]/).pop() : "";
      const printerMatch = batchFolder.match(PRINTER_RE);
      const printer = printerMatch ? printerMatch[1].toUpperCase() : null;
      return { ...row, printer };
    });
  } catch (err) {
    console.error("[db] getRollbackDetails failed:", err);
    return [];
  }
};
