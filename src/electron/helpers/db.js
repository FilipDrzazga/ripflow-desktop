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
let stmtInsertFileStage = null;
let stmtGetFileStage = null;
let stmtGetFileStagesByBatch = null;
let stmtGetAllFileStages = null;
let stmtAdvanceFileStage = null;
let stmtRejectFileStage = null;
let stmtOverrideFileStage = null;
let stmtClearFileStage = null;
let stmtClearFileStagesByBatch = null;
let stmtSetSewingSent = null;
let stmtSetSewingReceived = null;
let stmtInsertStageHistory = null;
let stmtGetAllStageHistory = null;
let stmtClearStageHistoryByFileId = null;
let stmtClearStageHistoryByBatch = null;
let stmtAdvanceFileStageGuarded = null;
let stmtRejectFileStageGuarded = null;
let stmtSetSewingSentGuarded = null;
let stmtSetSewingReceivedGuarded = null;
let stmtGetFileStagesAfter = null;

const PRINTER_RE = /-(DGEN|YOKO|YUMI)$/i;

export const initDb = () => {
  try {
    const dbPath = join(getStorageRootPath(), "ripflow.db");
    db = new Database(dbPath);
    // Wait up to 5s for a concurrent writer's lock (default 0 = instant SQLITE_BUSY,
    // which the guarded db fns would swallow as a silent write loss)
    db.pragma("busy_timeout = 5000");

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

    // Assign UUIDs to any legacy log rows that have a NULL id (SQLite allows NULLs in TEXT PRIMARY KEY)
    const nullIdLogs = db.prepare("SELECT rowid FROM logs WHERE id IS NULL").all();
    if (nullIdLogs.length > 0) {
      const fixStmt = db.prepare("UPDATE logs SET id = ? WHERE rowid = ?");
      for (const row of nullIdLogs) fixStmt.run(crypto.randomUUID(), row.rowid);
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
        process      TEXT,
        print_type   TEXT,
        meters       REAL
      )
    `);

    try { db.exec("ALTER TABLE rollback_reasons ADD COLUMN print_type TEXT"); } catch { /* already exists */ }
    try { db.exec("ALTER TABLE rollback_reasons ADD COLUMN meters REAL"); } catch { /* already exists */ }

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
      "INSERT OR REPLACE INTO rollback_reasons (id, file_id, batch_path, reason_code, reason_label, timestamp, workstation, order_id, customer, fabric, process, print_type, meters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    // Insert OR IGNORE — seeds on first run, backfills new defaults on existing DBs without overwriting user edits
    const stmtF = db.prepare(
      "INSERT OR IGNORE INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const f of DEFAULT_FABRICS) {
      stmtF.run(f.name, f.type, f.xmlWidth, f.rollWidth, f.isVelvet, f.isLinen, f.isBlossom);
    }

    // ── file_stages ───────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_stages (
        file_id            TEXT PRIMARY KEY,
        batch_path         TEXT NOT NULL,
        print_type         TEXT,
        customer_name      TEXT,
        order_id           TEXT,
        material           TEXT,
        meters             REAL,
        qty                INTEGER,
        stage              TEXT NOT NULL DEFAULT 'printed',
        prev_stage         TEXT,
        updated_at         TEXT NOT NULL,
        updated_by         TEXT,
        sewing_sent_at     TEXT,
        sewing_received_at TEXT
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_file_stages_batch ON file_stages(batch_path)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_file_stages_stage ON file_stages(stage)");
    try { db.exec("ALTER TABLE file_stages ADD COLUMN meters REAL"); } catch { /* already exists */ }
    try { db.exec("ALTER TABLE file_stages ADD COLUMN qty INTEGER"); } catch { /* already exists */ }
    try { db.exec("ALTER TABLE file_stages ADD COLUMN sewing_company TEXT"); } catch { /* already exists */ }
    try { db.exec("ALTER TABLE file_stages ADD COLUMN qty_override INTEGER"); } catch { /* already exists */ }
    try { db.exec("ALTER TABLE file_stages ADD COLUMN meters_override REAL"); } catch { /* already exists */ }

    stmtInsertFileStage = db.prepare(
      "INSERT OR REPLACE INTO file_stages (file_id, batch_path, print_type, customer_name, order_id, material, meters, qty, qty_override, meters_override, stage, prev_stage, updated_at, updated_by, sewing_sent_at, sewing_received_at, sewing_company) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetFileStage = db.prepare("SELECT * FROM file_stages WHERE file_id = ?");
    stmtGetFileStagesByBatch = db.prepare("SELECT * FROM file_stages WHERE batch_path = ?");
    stmtGetAllFileStages = db.prepare("SELECT * FROM file_stages ORDER BY updated_at DESC");
    stmtAdvanceFileStage = db.prepare("UPDATE file_stages SET stage = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtRejectFileStage = db.prepare("UPDATE file_stages SET prev_stage = stage, stage = 'rejected', updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtOverrideFileStage = db.prepare("UPDATE file_stages SET stage = 'overridden', updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtClearFileStage = db.prepare("DELETE FROM file_stages WHERE file_id = ?");
    stmtClearFileStagesByBatch = db.prepare("DELETE FROM file_stages WHERE batch_path = ?");
    stmtSetSewingSent = db.prepare("UPDATE file_stages SET stage = 'to_sewing', sewing_sent_at = ?, sewing_company = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtSetSewingReceived = db.prepare("UPDATE file_stages SET stage = 'from_sewing', sewing_received_at = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");

    // ── file_stage_history ────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_stage_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id    TEXT NOT NULL,
        stage      TEXT NOT NULL,
        entered_at TEXT NOT NULL
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_stage_history_file ON file_stage_history(file_id)");
    stmtInsertStageHistory       = db.prepare("INSERT INTO file_stage_history (file_id, stage, entered_at) VALUES (?, ?, ?)");
    stmtGetAllStageHistory       = db.prepare("SELECT file_id, stage, entered_at FROM file_stage_history ORDER BY entered_at ASC");
    stmtClearStageHistoryByFileId = db.prepare("DELETE FROM file_stage_history WHERE file_id = ?");
    stmtClearStageHistoryByBatch  = db.prepare("DELETE FROM file_stage_history WHERE file_id IN (SELECT file_id FROM file_stages WHERE batch_path = ?)");
    stmtAdvanceFileStageGuarded  = db.prepare("UPDATE file_stages SET stage = ?, updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
    stmtRejectFileStageGuarded   = db.prepare("UPDATE file_stages SET prev_stage = stage, stage = 'rejected', updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
    stmtSetSewingSentGuarded     = db.prepare("UPDATE file_stages SET stage = 'to_sewing', sewing_sent_at = ?, sewing_company = ?, updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
    stmtSetSewingReceivedGuarded = db.prepare("UPDATE file_stages SET stage = 'from_sewing', sewing_received_at = ?, updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
    stmtGetFileStagesAfter       = db.prepare("SELECT * FROM file_stages WHERE updated_at > ? ORDER BY updated_at ASC");

    // ── reprint_requests ──────────────────────────────────────────────────────
    // One row per rollback-from-Production event. qty_affected unit follows
    // print_type: meters for LM, piece count otherwise. A request is "open"
    // while fulfilled_at and superseded_at are both NULL.
    db.exec(`
      CREATE TABLE IF NOT EXISTS reprint_requests (
        id            TEXT PRIMARY KEY,
        file_id       TEXT NOT NULL,
        batch_path    TEXT,
        print_type    TEXT,
        qty_affected  REAL NOT NULL,
        qty_original  REAL,
        workstation   TEXT,
        created_at    TEXT NOT NULL,
        fulfilled_at  TEXT,
        superseded_at TEXT
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_reprint_requests_file ON reprint_requests(file_id)");
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
    stmtInsertFileStage = null;
    stmtGetFileStage = null;
    stmtGetFileStagesByBatch = null;
    stmtGetAllFileStages = null;
    stmtAdvanceFileStage = null;
    stmtRejectFileStage = null;
    stmtOverrideFileStage = null;
    stmtClearFileStage = null;
    stmtClearFileStagesByBatch = null;
    stmtSetSewingSent = null;
    stmtSetSewingReceived = null;
    stmtInsertStageHistory = null;
    stmtGetAllStageHistory = null;
    stmtClearStageHistoryByFileId = null;
    stmtClearStageHistoryByBatch = null;
    stmtAdvanceFileStageGuarded = null;
    stmtRejectFileStageGuarded = null;
    stmtSetSewingSentGuarded = null;
    stmtSetSewingReceivedGuarded = null;
    stmtGetFileStagesAfter = null;
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
  printType,
  meters,
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
      printType ?? null,
      meters ?? null,
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
  if (!db) return { total: 0, byReason: [], byPrinter: [], byProcess: [], byFabric: [] };
  try {
    const rows = since
      ? db.prepare("SELECT * FROM rollback_reasons WHERE timestamp >= ?").all(since)
      : db.prepare("SELECT * FROM rollback_reasons").all();

    const reasonMap = new Map();
    const printerMap = new Map();
    const processMap = new Map();
    const fabricMetersMap = new Map();

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

      const proc = row.process || "Unknown";
      processMap.set(proc, (processMap.get(proc) || 0) + 1);

      if (row.fabric && row.meters != null) {
        fabricMetersMap.set(row.fabric, (fabricMetersMap.get(row.fabric) || 0) + row.meters);
      }
    }

    return {
      total: rows.length,
      byReason: [...reasonMap.values()].sort((a, b) => b.count - a.count),
      byPrinter: [...printerMap.entries()]
        .map(([printer, count]) => ({ printer, count }))
        .sort((a, b) => b.count - a.count),
      byProcess: [...processMap.entries()]
        .map(([process, count]) => ({ process, count }))
        .sort((a, b) => b.count - a.count),
      byFabric: [...fabricMetersMap.entries()]
        .map(([fabric, meters]) => ({ fabric, meters: Number(meters.toFixed(2)) }))
        .sort((a, b) => b.meters - a.meters),
    };
  } catch (err) {
    console.error("[db] getRollbackStats failed:", err);
    return { total: 0, byReason: [], byPrinter: [], byProcess: [], byFabric: [] };
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

// ── file_stage_history ────────────────────────────────────────────────────────

const _insertStageHistory = (fileId, stage, enteredAt) => {
  if (!stmtInsertStageHistory) return;
  stmtInsertStageHistory.run(fileId, stage, enteredAt);
};

export const clearAllFileStages = () => {
  if (!db) return;
  db.exec("DELETE FROM file_stage_history");
  db.exec("DELETE FROM file_stages");
};

export const getAllStageHistory = () => {
  if (!stmtGetAllStageHistory) return [];
  try {
    return stmtGetAllStageHistory.all();
  } catch (err) {
    console.error("[db] getAllStageHistory failed:", err);
    return [];
  }
};

// ── file_stages ───────────────────────────────────────────────────────────────

export const insertFileStage = (row) => {
  if (!stmtInsertFileStage) return null;
  try {
    stmtInsertFileStage.run(
      row.file_id, row.batch_path, row.print_type ?? null, row.customer_name ?? null,
      row.order_id ?? null, row.material ?? null, row.meters ?? null, row.qty ?? null,
      row.qty_override ?? null, row.meters_override ?? null,
      row.stage ?? "printed", row.prev_stage ?? null,
      row.updated_at, row.updated_by ?? null, row.sewing_sent_at ?? null, row.sewing_received_at ?? null, row.sewing_company ?? null,
    );
    _insertStageHistory(row.file_id, row.stage ?? "printed", row.updated_at);
  } catch (err) {
    console.error("[db] insertFileStage failed:", err);
  }
};

export const getFileStage = (fileId) => {
  if (!stmtGetFileStage) return null;
  try {
    return stmtGetFileStage.get(fileId) ?? null;
  } catch (err) {
    console.error("[db] getFileStage failed:", err);
    return null;
  }
};

export const getFileStagesByBatch = (batchPath) => {
  if (!stmtGetFileStagesByBatch) return [];
  try {
    return stmtGetFileStagesByBatch.all(batchPath);
  } catch (err) {
    console.error("[db] getFileStagesByBatch failed:", err);
    return [];
  }
};

export const getFileStagesAfter = (since) => {
  if (!stmtGetFileStagesAfter) return [];
  try {
    return stmtGetFileStagesAfter.all(since).map(addPrinterToStageRow);
  } catch (err) {
    console.error("[db] getFileStagesAfter failed:", err);
    return [];
  }
};

const addPrinterToStageRow = (row) => {
  const batchFolder = row.batch_path ? row.batch_path.split(/[/\\]/).pop() : "";
  const printerMatch = batchFolder.match(PRINTER_RE);
  return { ...row, printer: printerMatch ? printerMatch[1].toUpperCase() : null };
};

export const getAllFileStages = () => {
  if (!stmtGetAllFileStages) return [];
  try {
    return stmtGetAllFileStages.all().map(addPrinterToStageRow);
  } catch (err) {
    console.error("[db] getAllFileStages failed:", err);
    return [];
  }
};

export const advanceFileStage = (fileId, newStage, updatedBy, expectedStage) => {
  if (!stmtAdvanceFileStage) return null;
  try {
    const now = new Date().toISOString();
    const result = expectedStage
      ? stmtAdvanceFileStageGuarded.run(newStage, now, updatedBy ?? null, fileId, expectedStage)
      : stmtAdvanceFileStage.run(newStage, now, updatedBy ?? null, fileId);
    if (result.changes > 0) _insertStageHistory(fileId, newStage, now);
    return { updated: result.changes > 0 };
  } catch (err) {
    console.error("[db] advanceFileStage failed:", err);
  }
};

export const rejectFileStage = (fileId, updatedBy, expectedStage) => {
  if (!stmtRejectFileStage) return null;
  try {
    const now = new Date().toISOString();
    const result = expectedStage
      ? stmtRejectFileStageGuarded.run(now, updatedBy ?? null, fileId, expectedStage)
      : stmtRejectFileStage.run(now, updatedBy ?? null, fileId);
    if (result.changes > 0) _insertStageHistory(fileId, "rejected", now);
    return { updated: result.changes > 0 };
  } catch (err) {
    console.error("[db] rejectFileStage failed:", err);
  }
};

export const overrideFileStage = (fileId, updatedBy) => {
  if (!stmtOverrideFileStage) return null;
  try {
    const now = new Date().toISOString();
    stmtOverrideFileStage.run(now, updatedBy ?? null, fileId);
    _insertStageHistory(fileId, "overridden", now);
  } catch (err) {
    console.error("[db] overrideFileStage failed:", err);
  }
};

export const clearFileStage = (fileId) => {
  if (!stmtClearFileStage) return null;
  try {
    if (stmtClearStageHistoryByFileId) stmtClearStageHistoryByFileId.run(fileId);
    stmtClearFileStage.run(fileId);
  } catch (err) {
    console.error("[db] clearFileStage failed:", err);
  }
};

export const clearFileStagesByBatch = (batchPath) => {
  if (!stmtClearFileStagesByBatch) return null;
  try {
    if (stmtClearStageHistoryByBatch) stmtClearStageHistoryByBatch.run(batchPath);
    stmtClearFileStagesByBatch.run(batchPath);
  } catch (err) {
    console.error("[db] clearFileStagesByBatch failed:", err);
  }
};

export const setSewingSent = (fileId, updatedBy, expectedStage, sewingCompany) => {
  if (!stmtSetSewingSent) return null;
  try {
    const now = new Date().toISOString();
    const result = expectedStage
      ? stmtSetSewingSentGuarded.run(now, sewingCompany ?? null, now, updatedBy ?? null, fileId, expectedStage)
      : stmtSetSewingSent.run(now, sewingCompany ?? null, now, updatedBy ?? null, fileId);
    if (result.changes > 0) _insertStageHistory(fileId, "to_sewing", now);
    return { updated: result.changes > 0 };
  } catch (err) {
    console.error("[db] setSewingSent failed:", err);
  }
};

export const setSewingReceived = (fileId, updatedBy, expectedStage) => {
  if (!stmtSetSewingReceived) return null;
  try {
    const now = new Date().toISOString();
    const result = expectedStage
      ? stmtSetSewingReceivedGuarded.run(now, now, updatedBy ?? null, fileId, expectedStage)
      : stmtSetSewingReceived.run(now, now, updatedBy ?? null, fileId);
    if (result.changes > 0) _insertStageHistory(fileId, "from_sewing", now);
    return { updated: result.changes > 0 };
  } catch (err) {
    console.error("[db] setSewingReceived failed:", err);
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

export const cleanupShippedStages = (days) => {
  if (!db) return;
  try {
    const safeDays = Math.max(1, Math.floor(Number(days) || 30));
    const info = db.prepare(
      `DELETE FROM file_stages WHERE stage = 'shipped' AND updated_at < datetime('now', '-${safeDays} days')`
    ).run();
    if (info.changes > 0) console.log(`[db] cleanupShippedStages: removed ${info.changes} records older than ${safeDays} days`);
  } catch (err) {
    console.error("[db] cleanupShippedStages failed:", err);
  }
};

// ── reprint_requests ─────────────────────────────────────────────────────────

const OPEN_REPRINT_FILTER = "fulfilled_at IS NULL AND superseded_at IS NULL";

// A new rollback supersedes any still-open request for the same file: the new
// qty reflects what actually needs reprinting now (the prior reprint never
// completed). Superseded rows are kept for per-event waste analytics.
export const insertReprintRequest = ({ id, fileId, batchPath, printType, qtyAffected, qtyOriginal, workstation }) => {
  if (!db) return;
  try {
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        `UPDATE reprint_requests SET superseded_at = ? WHERE file_id = ? AND ${OPEN_REPRINT_FILTER}`,
      ).run(now, fileId);
      db.prepare(
        "INSERT INTO reprint_requests (id, file_id, batch_path, print_type, qty_affected, qty_original, workstation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, fileId, batchPath ?? null, printType ?? null, qtyAffected, qtyOriginal ?? null, workstation ?? null, now);
    })();
  } catch (err) {
    console.error("[db] insertReprintRequest failed:", err);
  }
};

export const getOpenReprintRequests = () => {
  if (!db) return [];
  try {
    return db.prepare(`SELECT * FROM reprint_requests WHERE ${OPEN_REPRINT_FILTER} ORDER BY created_at DESC`).all();
  } catch (err) {
    console.error("[db] getOpenReprintRequests failed:", err);
    return [];
  }
};

export const getOpenReprintRequestsByFileIds = (fileIds) => {
  if (!db || !fileIds.length) return [];
  try {
    const placeholders = fileIds.map(() => "?").join(",");
    return db
      .prepare(`SELECT * FROM reprint_requests WHERE file_id IN (${placeholders}) AND ${OPEN_REPRINT_FILTER}`)
      .all(...fileIds);
  } catch (err) {
    console.error("[db] getOpenReprintRequestsByFileIds failed:", err);
    return [];
  }
};

export const fulfillReprintRequests = (fileId) => {
  if (!db) return;
  try {
    db.prepare(
      `UPDATE reprint_requests SET fulfilled_at = ? WHERE file_id = ? AND ${OPEN_REPRINT_FILTER}`,
    ).run(new Date().toISOString(), fileId);
  } catch (err) {
    console.error("[db] fulfillReprintRequests failed:", err);
  }
};

export const getReprintRequests = (since) => {
  if (!db) return [];
  try {
    return since
      ? db.prepare("SELECT * FROM reprint_requests WHERE created_at >= ? ORDER BY created_at DESC").all(since)
      : db.prepare("SELECT * FROM reprint_requests ORDER BY created_at DESC").all();
  } catch (err) {
    console.error("[db] getReprintRequests failed:", err);
    return [];
  }
};

export const clearAllReprintRequests = () => {
  if (!db) return;
  try {
    db.prepare("DELETE FROM reprint_requests").run();
  } catch (err) {
    console.error("[db] clearAllReprintRequests failed:", err);
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
