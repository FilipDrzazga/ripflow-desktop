import { join } from "path";
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from "fs";
import { app } from "electron";
import Database from "better-sqlite3";
import { getStorageRootPath } from "./getRootPath.js";
import { DEFAULT_FABRICS, DEFAULT_FABRIC_GLOBALS } from "./defaultFabrics.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

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
let stmtDeleteCustomOrder = null;
let stmtInsertFileStage = null;
let stmtGetFileStagesByBatch = null;
let stmtGetAllFileStages = null;
let stmtAdvanceFileStage = null;
let stmtClearFileStage = null;
let stmtClearFileStagesByBatch = null;
let stmtSetSewingSent = null;
let stmtSetSewingReceived = null;
let stmtInsertStageHistory = null;
let stmtGetAllStageHistory = null;
let stmtClearStageHistoryByFileId = null;
let stmtClearStageHistoryByBatch = null;
let stmtAdvanceFileStageGuarded = null;
let stmtSetSewingSentGuarded = null;
let stmtSetSewingReceivedGuarded = null;
let stmtGetFileStagesAfter = null;
let stmtInsertRipError = null;
let stmtGetOpenRipErrors = null;

const PRINTER_RE = /-(DGEN|YOKO|YUMI)$/i;

// ── DB error signalling (critical writes only) ──────────────────────────────────
// Transient errors are already retried by busy_timeout (#1) — never alarm on them.
// A permanent write failure flips a "degraded" state and emits ONCE on transition;
// the first successful write afterwards emits "recovered" once. Keeps the UI to one banner.
const isTransientDbError = (err) =>
  ["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_LOCKED"].includes(err?.code);

let dbErrorSink = null;          // wired from main via setDbErrorSink
let dbDegradedInternal = false;
export const setDbErrorSink = (fn) => { dbErrorSink = fn; };
// Initial snapshot for the renderer — covers a boot-time DB failure whose db:error
// emit was lost because the sink/renderer did not exist yet.
export const getDbDegraded = () => dbDegradedInternal;

const signalPermanent = (label) => {
  if (!dbDegradedInternal) { dbDegradedInternal = true; dbErrorSink?.("db:error", { label }); }
};
const signalRecovered = () => {
  if (dbDegradedInternal) { dbDegradedInternal = false; dbErrorSink?.("db:recovered", {}); }
};

// Runs a critical write; returns bool. Transient → console.warn, no UI. Permanent
// (DB down / IO / full / corrupt) → flips degraded + emits once on transition.
const runWrite = (label, fn) => {
  if (!db) { signalPermanent(label); return false; }
  try {
    fn();
    signalRecovered();
    return true;
  } catch (err) {
    if (isTransientDbError(err)) { console.warn(`[db] transient (${label}):`, err.code); return false; }
    console.error(`[db] write failed (${label}):`, err);
    signalPermanent(label);
    return false;
  }
};

// Idempotent: add the `alias` column to an existing `fabrics` table if missing.
// Safe to call on every startup — a second run finds the column and does nothing.
const ensureFabricAliasColumn = () => {
  if (!db) return;
  try {
    const hasAlias = db
      .prepare("PRAGMA table_info(fabrics)")
      .all()
      .some((col) => col.name === "alias");
    if (!hasAlias) {
      db.exec("ALTER TABLE fabrics ADD COLUMN alias TEXT");
    }
  } catch (err) {
    console.error("[db] ensureFabricAliasColumn failed:", err);
  }
};

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

    // held_files is a GLOBAL hold model: one operator holds a file, everyone sees it.
    // Fresh DBs get the global shape directly (file_id PRIMARY KEY, reason).
    db.exec(`
      CREATE TABLE IF NOT EXISTS held_files (
        file_id TEXT PRIMARY KEY,
        reason  TEXT
      )
    `);

    // Migrate legacy per-workstation holds (composite PK file_id+workstation) → global.
    // Detect the old `workstation` column and rebuild deduplicated by file_id,
    // preserving any non-empty reason (MAX ignores NULLs).
    const heldFilesIsLegacy = db
      .prepare("PRAGMA table_info(held_files)")
      .all()
      .some((col) => col.name === "workstation");
    if (heldFilesIsLegacy) {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE held_files_new (
            file_id TEXT PRIMARY KEY,
            reason  TEXT
          )
        `);
        db.exec(
          "INSERT INTO held_files_new (file_id, reason) SELECT file_id, MAX(reason) FROM held_files GROUP BY file_id",
        );
        db.exec("DROP TABLE held_files");
        db.exec("ALTER TABLE held_files_new RENAME TO held_files");
      })();
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
    stmtHoldFile = db.prepare("INSERT OR REPLACE INTO held_files (file_id, reason) VALUES (?, ?)");
    stmtUnholdFile = db.prepare("DELETE FROM held_files WHERE file_id = ?");
    stmtGetHeldFiles = db.prepare("SELECT file_id, reason FROM held_files");
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
    stmtDeleteCustomOrder = db.prepare("DELETE FROM custom_order_history WHERE id = ?");

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
        is_blossom INTEGER NOT NULL DEFAULT 0,
        alias      TEXT
      )
    `);
    // Backfill the alias column on existing DBs created before it was introduced.
    ensureFabricAliasColumn();
    // Seed the default catalog on first run only — an existing catalog is the shop's own data,
    // so a fabric the operator deleted must not come back on the next startup.
    const fabricsCount = db.prepare("SELECT COUNT(*) AS c FROM fabrics").get().c;
    if (fabricsCount === 0 && DEFAULT_FABRICS.length > 0) {
      const stmtF = db.prepare(
        "INSERT OR IGNORE INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const f of DEFAULT_FABRICS) {
        stmtF.run(f.name, f.type, f.xmlWidth, f.rollWidth, f.isVelvet, f.isLinen, f.isBlossom);
      }
    }

    // ── shop_profile ──────────────────────────────────────────────────────────
    // One row, one JSON blob. CHECK(id = 1) makes a second row impossible, so every
    // reader can take the row without asking which one it is.
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_profile (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        data       TEXT NOT NULL,
        updated_at TEXT,
        updated_by TEXT
      )
    `);
    // Seed on first run only — same guard as fabric_globals above, so several stations
    // starting against the shared DB cannot overwrite an edited profile with the default.
    const profileCount = db.prepare("SELECT COUNT(*) AS c FROM shop_profile").get().c;
    if (profileCount === 0) {
      db.prepare(
        "INSERT INTO shop_profile (id, data, updated_at, updated_by) VALUES (1, ?, ?, ?)",
      ).run(JSON.stringify(DEFAULT_PROFILE), new Date().toISOString(), "system");
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
    stmtGetFileStagesByBatch = db.prepare("SELECT * FROM file_stages WHERE batch_path = ?");
    stmtGetAllFileStages = db.prepare("SELECT * FROM file_stages ORDER BY updated_at DESC");
    stmtAdvanceFileStage = db.prepare("UPDATE file_stages SET stage = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtClearFileStage = db.prepare("DELETE FROM file_stages WHERE file_id = ?");
    stmtClearFileStagesByBatch = db.prepare("DELETE FROM file_stages WHERE batch_path = ?");
    stmtSetSewingSent = db.prepare("UPDATE file_stages SET stage = 'to_sewing', sewing_sent_at = ?, sewing_company = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");
    stmtSetSewingReceived = db.prepare("UPDATE file_stages SET stage = 'packed', sewing_received_at = ?, updated_at = ?, updated_by = ? WHERE file_id = ?");

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
    stmtSetSewingSentGuarded     = db.prepare("UPDATE file_stages SET stage = 'to_sewing', sewing_sent_at = ?, sewing_company = ?, updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
    stmtSetSewingReceivedGuarded = db.prepare("UPDATE file_stages SET stage = 'packed', sewing_received_at = ?, updated_at = ?, updated_by = ? WHERE file_id = ? AND stage = ?");
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

    // ── rip_errors ─────────────────────────────────────────────────────────────
    // One row per ERRORED FILE. A pre-split failure (Shape B) affecting N files yields N
    // rows that share one job_guid, so the PK is a synthetic id and dedup is on the
    // (job_guid, file_id) pair. file_id = stem of the affected pdf. resolved_at NULL = open
    // (resolve logic reserved for a later phase).
    db.exec(`
      CREATE TABLE IF NOT EXISTS rip_errors (
        id            TEXT PRIMARY KEY,
        job_guid      TEXT NOT NULL,
        file_id       TEXT NOT NULL,
        batch_id      TEXT,
        nesting_group TEXT,
        failed_node   TEXT,
        error_message TEXT,
        document_id   TEXT,
        detected_at   TEXT NOT NULL,
        created_at    TEXT,
        resolved_at   TEXT,
        UNIQUE(job_guid, file_id)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_rip_errors_file ON rip_errors(file_id)");
    stmtInsertRipError = db.prepare(
      "INSERT OR IGNORE INTO rip_errors (id, job_guid, file_id, batch_id, nesting_group, failed_node, error_message, document_id, detected_at, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmtGetOpenRipErrors = db.prepare("SELECT * FROM rip_errors WHERE resolved_at IS NULL ORDER BY detected_at DESC");
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
    stmtDeleteCustomOrder = null;
    stmtInsertFileStage = null;
    stmtGetFileStagesByBatch = null;
    stmtGetAllFileStages = null;
    stmtAdvanceFileStage = null;
    stmtClearFileStage = null;
    stmtClearFileStagesByBatch = null;
    stmtSetSewingSent = null;
    stmtSetSewingReceived = null;
    stmtInsertStageHistory = null;
    stmtGetAllStageHistory = null;
    stmtClearStageHistoryByFileId = null;
    stmtClearStageHistoryByBatch = null;
    stmtAdvanceFileStageGuarded = null;
    stmtSetSewingSentGuarded = null;
    stmtSetSewingReceivedGuarded = null;
    stmtGetFileStagesAfter = null;
    stmtInsertRipError = null;
    stmtGetOpenRipErrors = null;
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

export const clearAllLogs = (workstation) =>
  runWrite("clearAllLogs", () => {
    if (workstation) stmtClearByWorkstation.run(workstation);
    else stmtClear.run();
  });

export const holdFile = (fileId, reason = "") =>
  runWrite("holdFile", () => stmtHoldFile.run(fileId, reason || null));

export const unholdFile = (fileId) =>
  runWrite("unholdFile", () => stmtUnholdFile.run(fileId));

export const getHeldFiles = () => {
  if (!stmtGetHeldFiles) return [];
  try {
    return stmtGetHeldFiles.all();
  } catch (err) {
    console.error("[db] getHeldFiles failed:", err);
    return [];
  }
};

// Prune orphaned holds: delete every held_files row whose file_id is NOT among the
// current live inbox ids. `liveIds` is the FRESH inbox id set from readFolders
// (id === `${folder}_${filename}`), passed in by the caller — the diff is done here so
// only the (small) orphan set hits the DELETE, keeping the parameter list bounded.
// The renderer only calls this after a clean, complete scan (res.success && no warnings).
// Guard: a non-array / EMPTY liveIds is refused — treating "no data" as "every hold is an
// orphan" would wipe the table, so a spurious empty/failed scan can never clear all holds
// (an inflated Hold count is acceptable; deleting a live hold is not).
export const pruneOrphanHeldFiles = (liveIds) => {
  if (!db || !stmtGetHeldFiles) return { success: false, removed: 0 };
  if (!Array.isArray(liveIds) || liveIds.length === 0) return { success: false, removed: 0 };

  let orphans;
  try {
    const live = new Set(liveIds);
    orphans = stmtGetHeldFiles.all().map((r) => r.file_id).filter((id) => !live.has(id));
  } catch (err) {
    console.error("[db] pruneOrphanHeldFiles (read) failed:", err);
    return { success: false, removed: 0 };
  }
  if (orphans.length === 0) return { success: true, removed: 0 };

  let removed = 0;
  const ok = runWrite("pruneOrphanHeldFiles", () => {
    const placeholders = orphans.map(() => "?").join(",");
    const info = db.prepare(`DELETE FROM held_files WHERE file_id IN (${placeholders})`).run(...orphans);
    removed = info.changes;
  });
  return { success: ok, removed: ok ? removed : 0 };
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
}) =>
  runWrite("insertRollbackReason", () => {
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
  });

export const getRollbackReasonsByBatch = (batchPath) => {
  if (!stmtGetRollbackReasonsByBatch) return [];
  try {
    return stmtGetRollbackReasonsByBatch.all(batchPath);
  } catch (err) {
    console.error("[db] getRollbackReasonsByBatch failed:", err);
    return [];
  }
};

export const clearAllRollbackReasons = () =>
  runWrite("clearAllRollbackReasons", () => stmtClearRollbackReasons.run());

// Hard-delete a single rollback_reasons row by primary key (per-row Analytics delete).
// Returns the run result so `.changes` is inspectable; undefined when the DB is unavailable.
export const deleteRollbackReason = (id) => {
  let result;
  runWrite("deleteRollbackReason", () => {
    result = db.prepare("DELETE FROM rollback_reasons WHERE id = ?").run(id);
  });
  return result;
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

export const insertCustomOrder = ({ poNumber, materialName, printer, date, totalFiles, missingFiles, totalMeters, status, files }) =>
  runWrite("insertCustomOrder", () =>
    stmtInsertCustomOrder.run(poNumber, materialName, printer, date, totalFiles, missingFiles, totalMeters, status, JSON.stringify(files ?? [])),
  );

export const clearCustomOrders = () =>
  runWrite("clearCustomOrders", () => stmtClearCustomOrders.run());

export const deleteCustomOrder = (id) => {
  let result;
  runWrite("deleteCustomOrder", () => {
    result = stmtDeleteCustomOrder.run(id);
  });
  return result;
};

export const getAllCustomOrders = () => {
  if (!stmtGetAllCustomOrders) return [];
  try {
    return stmtGetAllCustomOrders.all().map((row) => ({
      id: row.id,
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
  if (!db) return false;
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM reason_definitions").run();
      const stmt = db.prepare("INSERT INTO reason_definitions (code, label, icon_name, sort_order) VALUES (?, ?, ?, ?)");
      defs.forEach((d, i) => stmt.run(d.code, d.label, d.iconName, i));
    })();
    return true;
  } catch (err) {
    console.error("[db] setReasonDefinitions failed:", err);
    return false;
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
  if (!db) return false;
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO fabric_globals (key, value) VALUES (?, ?)");
    db.transaction(() => {
      for (const [key, value] of Object.entries(globals)) stmt.run(key, Number(value));
    })();
    return true;
  } catch (err) {
    console.error("[db] setFabricGlobals failed:", err);
    return false;
  }
};

// ── fabrics ──────────────────────────────────────────────────────────────────

// null = the catalog could not be read at all (DB unavailable, or the SELECT threw).
// [] = the table is genuinely empty. loadFabricCache needs that distinction to tell a
// degraded start (fall back to static typing) apart from a fresh install (no materials
// yet). Callers that need a plain array normalize with `?? []` at the call site.
export const getAllFabrics = () => {
  if (!db) return null;
  try {
    return db.prepare("SELECT name, type, xml_width AS xmlWidth, roll_width AS rollWidth, is_velvet AS isVelvet, is_linen AS isLinen, is_blossom AS isBlossom, alias FROM fabrics ORDER BY type ASC, name ASC").all();
  } catch (err) {
    console.error("[db] getAllFabrics failed:", err);
    return null;
  }
};

export const saveFabric = (oldName, fabric) => {
  if (!db) return false;
  try {
    // delete (on rename) + insert run in one transaction — true only if all of it commits
    db.transaction(() => {
      if (oldName && oldName !== fabric.name) {
        db.prepare("DELETE FROM fabrics WHERE name = ?").run(oldName);
      }
      db.prepare(
        "INSERT OR REPLACE INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom, alias) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(fabric.name, fabric.type, fabric.xmlWidth, fabric.rollWidth, fabric.isVelvet ? 1 : 0, fabric.isLinen ? 1 : 0, fabric.isBlossom ? 1 : 0, fabric.alias || null);
    })();
    return true;
  } catch (err) {
    console.error("[db] saveFabric failed:", err);
    return false;
  }
};

export const deleteFabric = (name) => {
  if (!db) return false;
  try {
    db.prepare("DELETE FROM fabrics WHERE name = ?").run(name);
    return true;
  } catch (err) {
    console.error("[db] deleteFabric failed:", err);
    return false;
  }
};

export const setAllFabrics = (fabrics) => {
  if (!db) return false;
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM fabrics").run();
      const stmt = db.prepare(
        "INSERT INTO fabrics (name, type, xml_width, roll_width, is_velvet, is_linen, is_blossom, alias) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const f of fabrics) {
        stmt.run(f.name, f.type, f.xmlWidth, f.rollWidth, f.isVelvet ? 1 : 0, f.isLinen ? 1 : 0, f.isBlossom ? 1 : 0, f.alias || null);
      }
    })();
    return true;
  } catch (err) {
    console.error("[db] setAllFabrics failed:", err);
    return false;
  }
};

// ── shop_profile ─────────────────────────────────────────────────────────────

// Two answers and one throw, on purpose: null = no row yet (fresh DB whose seed did not
// run), an object = the stored profile, and a throw = the DB could not be read at all.
// shopProfile.js maps those onto its own "not loaded" sentinel — this layer does not guess.
//
// A missing handle THROWS rather than returning null. Unlike getAllFabrics above, this
// reads a single row, so it has no spare value for "legitimately empty": null already
// means "no row". Returning it for "no database" too would collapse the two, and
// shopProfile.js would answer a dead NAS with DEFAULT_PROFILE — i.e. hand one client
// another client's printers, hotfolders and store handle.
export const getShopProfile = () => {
  if (!db) throw new Error("[db] getShopProfile: database not initialized");
  const row = db.prepare("SELECT data FROM shop_profile LIMIT 1").get();
  return row ? JSON.parse(row.data) : null;
};

export const setShopProfile = (profile, workstation) => {
  if (!db) return false;
  db.prepare(
    "INSERT INTO shop_profile (id, data, updated_at, updated_by) VALUES (1, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET data = excluded.data, " +
      "updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).run(JSON.stringify(profile), new Date().toISOString(), workstation ?? null);
  return true;
};

// ── file_stage_history ────────────────────────────────────────────────────────

const _insertStageHistory = (fileId, stage, enteredAt) => {
  if (!stmtInsertStageHistory) return;
  stmtInsertStageHistory.run(fileId, stage, enteredAt);
};

export const clearAllFileStages = () =>
  runWrite("clearAllFileStages", () => {
    db.exec("DELETE FROM file_stage_history");
    db.exec("DELETE FROM file_stages");
  });

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
  if (!stmtInsertFileStage) return false; // DB down — caller can surface a tracking warning
  try {
    stmtInsertFileStage.run(
      row.file_id, row.batch_path, row.print_type ?? null, row.customer_name ?? null,
      row.order_id ?? null, row.material ?? null, row.meters ?? null, row.qty ?? null,
      row.qty_override ?? null, row.meters_override ?? null,
      row.stage ?? "printed", row.prev_stage ?? null,
      row.updated_at, row.updated_by ?? null, row.sewing_sent_at ?? null, row.sewing_received_at ?? null, row.sewing_company ?? null,
    );
    _insertStageHistory(row.file_id, row.stage ?? "printed", row.updated_at);
    return true;
  } catch (err) {
    console.error("[db] insertFileStage failed:", err);
    return false;
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

export const clearFileStage = (fileId) =>
  runWrite("clearFileStage", () => {
    if (stmtClearStageHistoryByFileId) stmtClearStageHistoryByFileId.run(fileId);
    stmtClearFileStage.run(fileId);
  });

export const clearFileStagesByBatch = (batchPath) =>
  runWrite("clearFileStagesByBatch", () => {
    if (stmtClearStageHistoryByBatch) stmtClearStageHistoryByBatch.run(batchPath);
    stmtClearFileStagesByBatch.run(batchPath);
  });

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
    if (result.changes > 0) _insertStageHistory(fileId, "packed", now);
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

export const cleanupShippedStages = (days) =>
  runWrite("cleanupShippedStages", () => {
    const safeDays = Math.max(1, Math.floor(Number(days) || 30));
    const where = `stage = 'shipped' AND datetime(updated_at) < datetime('now', '-${safeDays} days')`;
    const purge = db.transaction(() => {
      // history first — the subquery needs the file_stages rows to still exist
      db.prepare(`DELETE FROM file_stage_history WHERE file_id IN (SELECT file_id FROM file_stages WHERE ${where})`).run();
      // then the stages themselves
      return db.prepare(`DELETE FROM file_stages WHERE ${where}`).run();
    });
    const info = purge();
    if (info.changes > 0) console.log(`[db] cleanupShippedStages: removed ${info.changes} records older than ${safeDays} days`);
  });

// ── reprint_requests ─────────────────────────────────────────────────────────

const OPEN_REPRINT_FILTER = "fulfilled_at IS NULL AND superseded_at IS NULL";

// A new rollback supersedes any still-open request for the same file: the new
// qty reflects what actually needs reprinting now (the prior reprint never
// completed). Superseded rows are kept for per-event waste analytics.
export const insertReprintRequest = ({ id, fileId, batchPath, printType, qtyAffected, qtyOriginal, workstation }) =>
  runWrite("insertReprintRequest", () => {
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        `UPDATE reprint_requests SET superseded_at = ? WHERE file_id = ? AND ${OPEN_REPRINT_FILTER}`,
      ).run(now, fileId);
      db.prepare(
        "INSERT INTO reprint_requests (id, file_id, batch_path, print_type, qty_affected, qty_original, workstation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, fileId, batchPath ?? null, printType ?? null, qtyAffected, qtyOriginal ?? null, workstation ?? null, now);
    })();
  });

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

export const fulfillReprintRequests = (fileId) =>
  runWrite("fulfillReprintRequests", () =>
    db.prepare(
      `UPDATE reprint_requests SET fulfilled_at = ? WHERE file_id = ? AND ${OPEN_REPRINT_FILTER}`,
    ).run(new Date().toISOString(), fileId),
  );

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

export const clearAllReprintRequests = () =>
  runWrite("clearAllReprintRequests", () => db.prepare("DELETE FROM reprint_requests").run());

// ── rip_errors ─────────────────────────────────────────────────────────────

// INSERT OR IGNORE dedups on the UNIQUE(job_guid, file_id) pair — a re-scanned xml (and
// each file within a pre-split failure) inserts at most once. The synthetic id matches the
// reprint_requests convention (crypto.randomUUID).
export const insertRipError = (row) =>
  runWrite("insertRipError", () => {
    stmtInsertRipError.run(
      crypto.randomUUID(),
      row.jobGuid,
      row.fileId,
      row.batchId ?? null,
      row.nestingGroup ?? null,
      row.failedNode ?? null,
      row.errorMessage ?? null,
      row.documentId ?? null,
      row.detectedAt ?? new Date().toISOString(),
      row.createdAt ?? null,
      null,
    );
  });

export const getOpenRipErrors = () => {
  if (!stmtGetOpenRipErrors) return [];
  try {
    return stmtGetOpenRipErrors.all();
  } catch (err) {
    console.error("[db] getOpenRipErrors failed:", err);
    return [];
  }
};

export const getRipErrorsByFileIds = (fileIds) => {
  if (!db || !fileIds.length) return [];
  try {
    const placeholders = fileIds.map(() => "?").join(",");
    return db
      .prepare(`SELECT * FROM rip_errors WHERE file_id IN (${placeholders}) AND resolved_at IS NULL`)
      .all(...fileIds);
  } catch (err) {
    console.error("[db] getRipErrorsByFileIds failed:", err);
    return [];
  }
};

// Rollback is the only resolve path: returning a file to the inbox makes ALL of its open
// errors stale, so resolve every open row for the file_id (not just the latest).
export const resolveRipErrorsByFile = (fileId) =>
  runWrite("resolveRipErrorsByFile", () =>
    db.prepare(
      "UPDATE rip_errors SET resolved_at = ? WHERE file_id = ? AND resolved_at IS NULL",
    ).run(new Date().toISOString(), fileId),
  );

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
