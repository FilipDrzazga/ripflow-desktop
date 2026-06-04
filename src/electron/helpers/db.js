import { join } from "path";
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from "fs";
import { app } from "electron";
import Database from "better-sqlite3";
import { getStorageRootPath } from "./getRootPath.js";
import { getSettings } from "./getSettings.js";
import { DEFAULT_FABRICS, DEFAULT_FABRIC_GLOBALS } from "./defaultFabrics.js";

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
let stmtInsertCustomOrder = null;
let stmtGetAllCustomOrders = null;
let stmtClearCustomOrders = null;

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
          reason      TEXT,
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
          reason      TEXT,
          PRIMARY KEY (file_id, workstation)
        )
      `);
      try {
        db.prepare("SELECT reason FROM held_files LIMIT 0").all();
      } catch {
        db.exec("ALTER TABLE held_files ADD COLUMN reason TEXT");
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_order_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        po_number     TEXT NOT NULL,
        material      TEXT NOT NULL,
        printer       TEXT NOT NULL,
        date          TEXT NOT NULL,
        total_files   INTEGER,
        missing_files INTEGER,
        total_meters  REAL,
        status        TEXT,
        files_json    TEXT
      )
    `);

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

    const needsProcessCleanup = (() => {
      try { return db.prepare("SELECT 1 FROM rollback_reasons WHERE process IS NULL OR process = '' LIMIT 1").get() != null; } catch { return false; }
    })();
    if (needsProcessCleanup) {
      try {
        db.exec("DELETE FROM rollback_reasons WHERE process IS NULL OR process = ''");
      } catch (err) {
        console.error("[db] cleanup rollback_reasons without process failed:", err);
      }
    }

    stmtInsert = db.prepare(
      "INSERT OR IGNORE INTO logs (id, timestamp, type, stage, code, message, detail, workstation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetAll = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500");
    stmtClear = db.prepare("DELETE FROM logs");
    stmtClearByWorkstation = db.prepare("DELETE FROM logs WHERE workstation = ?");
    stmtHoldFile = db.prepare("INSERT OR REPLACE INTO held_files (file_id, workstation, reason) VALUES (?, ?, ?)");
    stmtUnholdFile = db.prepare("DELETE FROM held_files WHERE file_id = ?");
    stmtGetHeldFiles = db.prepare("SELECT file_id, workstation, reason FROM held_files");
    db.exec("CREATE INDEX IF NOT EXISTS idx_rr_batch_path ON rollback_reasons(batch_path)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_rr_file_id ON rollback_reasons(file_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)");

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
    stmtInsertCustomOrder = db.prepare(
      "INSERT INTO custom_order_history (po_number, material, printer, date, total_files, missing_files, total_meters, status, files_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetAllCustomOrders = db.prepare(
      "SELECT * FROM custom_order_history ORDER BY date DESC",
    );
    stmtClearCustomOrders = db.prepare("DELETE FROM custom_order_history");

    // ── reason_definitions ──────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS reason_definitions (
        code       TEXT PRIMARY KEY,
        label      TEXT NOT NULL,
        icon_name  TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ── fabric_globals ───────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS fabric_globals (
        key   TEXT PRIMARY KEY,
        value REAL NOT NULL
      )
    `);
    const globalsCount = db.prepare("SELECT COUNT(*) AS c FROM fabric_globals").get().c;
    if (globalsCount === 0) {
      const stmtG = db.prepare("INSERT INTO fabric_globals (key, value) VALUES (?, ?)");
      for (const [key, value] of Object.entries(DEFAULT_FABRIC_GLOBALS)) {
        stmtG.run(key, value);
      }
    }

    // ── fabrics ──────────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS fabrics (
        name       TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        xml_width  INTEGER NOT NULL,
        roll_width INTEGER NOT NULL,
        is_velvet  INTEGER NOT NULL DEFAULT 0,
        is_linen   INTEGER NOT NULL DEFAULT 0,
        is_blossom INTEGER NOT NULL DEFAULT 0
      )
    `);
    const fabricsCount = db.prepare("SELECT COUNT(*) AS c FROM fabrics").get().c;
    if (fabricsCount === 0) {
      const stmtF = db.prepare(
        "INSERT OR IGNORE INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const f of DEFAULT_FABRICS) {
        stmtF.run(f.name, f.type, f.xmlWidth, f.rollWidth, f.isVelvet, f.isLinen, f.isBlossom);
      }
    }
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
    stmtInsertCustomOrder = null;
    stmtGetAllCustomOrders = null;
    stmtClearCustomOrders = null;
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

export const holdFile = (fileId, workstation = "", reason = "") => {
  if (!stmtHoldFile) return;
  try {
    stmtHoldFile.run(fileId, workstation, reason || null);
  } catch (err) {
    console.error("[db] holdFile failed:", err);
  }
};

export const unholdFile = (fileId) => {
  if (!stmtUnholdFile) return;
  try {
    stmtUnholdFile.run(fileId);
  } catch (err) {
    console.error("[db] unholdFile failed:", err);
  }
};

export const getHeldFiles = () => {
  if (!stmtGetHeldFiles) return [];
  try {
    return stmtGetHeldFiles.all();
  } catch (err) {
    console.error("[db] getHeldFiles failed:", err);
    return [];
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

export const getLatestRollbackReasonsForFileIds = (fileIds) => {
  if (!db || !fileIds.length) return [];
  try {
    const placeholders = fileIds.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT file_id, reason_code, reason_label, MAX(timestamp) AS timestamp
         FROM rollback_reasons
         WHERE file_id IN (${placeholders})
         GROUP BY file_id`,
      )
      .all(...fileIds);
  } catch (err) {
    console.error("[db] getLatestRollbackReasonsForFileIds failed:", err);
    return [];
  }
};

export const insertCustomOrder = ({ poNumber, materialName, printer, date, totalFiles, missingFiles, totalMeters, status, files }) => {
  if (!stmtInsertCustomOrder) return;
  try {
    stmtInsertCustomOrder.run(poNumber, materialName, printer, date, totalFiles, missingFiles, totalMeters, status, JSON.stringify(files ?? []));
  } catch (err) {
    console.error("[db] insertCustomOrder failed:", err);
  }
};

export const clearCustomOrders = () => {
  if (!stmtClearCustomOrders) return;
  try {
    stmtClearCustomOrders.run();
  } catch (err) {
    console.error("[db] clearCustomOrders failed:", err);
  }
};

export const getAllCustomOrders = () => {
  if (!stmtGetAllCustomOrders) return [];
  try {
    return stmtGetAllCustomOrders.all().map((row) => ({
      poNumber: row.po_number,
      materialName: row.material,
      printer: row.printer,
      date: row.date,
      totalFiles: row.total_files,
      missingFiles: row.missing_files,
      totalMeters: row.total_meters,
      status: row.status,
      files: row.files_json ? JSON.parse(row.files_json) : [],
    }));
  } catch (err) {
    console.error("[db] getAllCustomOrders failed:", err);
    return [];
  }
};

// ── reason_definitions ──────────────────────────────────────────────────────

export const getReasonDefinitions = () => {
  if (!db) return [];
  try {
    return db.prepare("SELECT code, label, icon_name AS iconName FROM reason_definitions ORDER BY sort_order ASC, code ASC").all();
  } catch (err) {
    console.error("[db] getReasonDefinitions failed:", err);
    return [];
  }
};

export const setReasonDefinitions = (defs) => {
  if (!db) return;
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM reason_definitions").run();
      const stmt = db.prepare("INSERT INTO reason_definitions (code, label, icon_name, sort_order) VALUES (?, ?, ?, ?)");
      defs.forEach((d, i) => stmt.run(d.code, d.label, d.iconName, i));
    })();
  } catch (err) {
    console.error("[db] setReasonDefinitions failed:", err);
  }
};

export const migrateReasonDefinitions = (defs) => {
  if (!db || !Array.isArray(defs) || defs.length === 0) return;
  try {
    const count = db.prepare("SELECT COUNT(*) AS c FROM reason_definitions").get().c;
    if (count > 0) return;
    db.transaction(() => {
      const stmt = db.prepare("INSERT OR IGNORE INTO reason_definitions (code, label, icon_name, sort_order) VALUES (?, ?, ?, ?)");
      defs.forEach((d, i) => stmt.run(d.code, d.label, d.iconName ?? "LuEllipsis", i));
    })();
  } catch (err) {
    console.error("[db] migrateReasonDefinitions failed:", err);
  }
};

// ── fabric_globals ───────────────────────────────────────────────────────────

export const getFabricGlobals = () => {
  if (!db) return { ...DEFAULT_FABRIC_GLOBALS };
  try {
    const rows = db.prepare("SELECT key, value FROM fabric_globals").all();
    const result = { ...DEFAULT_FABRIC_GLOBALS };
    for (const row of rows) result[row.key] = row.value;
    return result;
  } catch (err) {
    console.error("[db] getFabricGlobals failed:", err);
    return { ...DEFAULT_FABRIC_GLOBALS };
  }
};

export const setFabricGlobals = (globals) => {
  if (!db) return;
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO fabric_globals (key, value) VALUES (?, ?)");
    db.transaction(() => {
      for (const [key, value] of Object.entries(globals)) stmt.run(key, Number(value));
    })();
  } catch (err) {
    console.error("[db] setFabricGlobals failed:", err);
  }
};

// ── fabrics ──────────────────────────────────────────────────────────────────

export const getAllFabrics = () => {
  if (!db) return DEFAULT_FABRICS.map((f) => ({ ...f }));
  try {
    return db.prepare("SELECT name, type, xml_width AS xmlWidth, roll_width AS rollWidth, is_velvet AS isVelvet, is_linen AS isLinen, is_blossom AS isBlossom FROM fabrics ORDER BY type ASC, name ASC").all();
  } catch (err) {
    console.error("[db] getAllFabrics failed:", err);
    return DEFAULT_FABRICS.map((f) => ({ ...f }));
  }
};

export const saveFabric = (oldName, fabric) => {
  if (!db) return;
  try {
    db.transaction(() => {
      if (oldName && oldName !== fabric.name) {
        db.prepare("DELETE FROM fabrics WHERE name = ?").run(oldName);
      }
      db.prepare(
        "INSERT OR REPLACE INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(fabric.name, fabric.type, fabric.xmlWidth, fabric.rollWidth, fabric.isVelvet ? 1 : 0, fabric.isLinen ? 1 : 0, fabric.isBlossom ? 1 : 0);
    })();
  } catch (err) {
    console.error("[db] saveFabric failed:", err);
  }
};

export const deleteFabric = (name) => {
  if (!db) return;
  try {
    db.prepare("DELETE FROM fabrics WHERE name = ?").run(name);
  } catch (err) {
    console.error("[db] deleteFabric failed:", err);
  }
};

export const setAllFabrics = (fabrics) => {
  if (!db) return;
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM fabrics").run();
      const stmt = db.prepare(
        "INSERT INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const f of fabrics) {
        stmt.run(f.name, f.type, f.xmlWidth, f.rollWidth, f.isVelvet ? 1 : 0, f.isLinen ? 1 : 0, f.isBlossom ? 1 : 0);
      }
    })();
  } catch (err) {
    console.error("[db] setAllFabrics failed:", err);
  }
};

export const backupDb = async (force = false) => {
  if (!db) return { success: false, error: "Database not initialized." };
  try {
    const backupDir = join(app.getPath("userData"), "backups");
    mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 10);
    const dest = join(backupDir, `ripflow_${stamp}.db`);

    if (!force && existsSync(dest)) {
      return { success: true, path: dest, skipped: true };
    }

    await db.backup(dest);

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of readdirSync(backupDir)) {
      if (!file.startsWith("ripflow_") || !file.endsWith(".db")) continue;
      const fp = join(backupDir, file);
      if (fp !== dest && statSync(fp).mtimeMs < cutoff) unlinkSync(fp);
    }

    return { success: true, path: dest, skipped: false };
  } catch (err) {
    console.error("[db] backupDb failed:", err);
    return { success: false, error: err.message };
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
