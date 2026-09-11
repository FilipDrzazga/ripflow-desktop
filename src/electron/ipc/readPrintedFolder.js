import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getProfile } from "../helpers/shopProfile.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { getEstimateConfig } from "../helpers/fabricCache.js";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";
import { getOpenReprintRequestsByFileIds, insertLog, getDbDegraded } from "../helpers/db.js";
import { BATCH_STATUS, FILE_STATUS } from "../../shared/constants.js";
import { createLogOnce } from "../helpers/logOnce.js";

const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

// ONE throttle instance for the whole module, keyed by folder path, so a persistent bad
// folder or an unreachable day logs at most once per window across every enumeration
// (readPrintedDays runs on every BatchHistory mount and after every submit, from three
// stations, into the SHARED SQLite log - without this it would drip forever).
const logOnce = createLogOnce();

// Which station raised the diagnostic. INJECTED by index.js rather than imported: pulling
// getSettings (electron-store) into this module would drag the electron chain into
// normalizeOverrideEntry.test.js and break it. A resolver (not a value) because the station
// name can change in Settings mid-session. It matters here specifically because the
// 2026-09-10 incident was ONE station seeing different data than the rest - the station name
// is the field that makes such an event visible in the shared log.
let resolveWorkstation = () => null;
export const setDiagWorkstationResolver = (fn) => {
  resolveWorkstation = typeof fn === "function" ? fn : () => null;
};

// Emit a diagnostic for a silent disk-read problem: always to the main console, and - when
// the DB is not already known-degraded - to the session log too. insertLog is a SYNCHRONOUS
// better-sqlite3 write; skipping it while degraded keeps a hung SMB share from blocking main
// on a pile of log writes (getDbDegraded reflects a prior DB error). insertLog is also
// wrapped so a logging failure can never break the read.
const diag = (key, { type, code, message, detail }) => {
  if (!logOnce(key)) return;
  if (type === "error") console.error(`[readPrinted] ${code}: ${message}`, detail);
  else console.warn(`[readPrinted] ${code}: ${message}`, detail);
  if (getDbDegraded()) return;
  let workstation = null;
  try {
    workstation = resolveWorkstation();
  } catch {
    // a broken resolver must not break the read - fall back to null
  }
  try {
    insertLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      stage: "readPrinted",
      code,
      message,
      detail,
      workstation,
    });
  } catch {
    // logging must never break the read
  }
};

// Shape the raw fields of a caught fs error for a diagnostic detail.
const osFields = (err) => ({ code: err?.code ?? null, errno: err?.errno ?? null, syscall: err?.syscall ?? null });

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;
const BATCH_FOLDER_RE = /^PRINTED_\d{6}-(.+)-(DGEN|YOKO|YUMI)$/;

export const parseBatchFolderName = (name) => {
  const m = name.match(BATCH_FOLDER_RE);
  if (!m) return null;
  return { group: m[1], printer: m[2] };
};

// Normalize a _batch_info.overrides[stem] entry to the Etap-2 provenance shape.
// New shape: { printed:{meters}|{qty}, manual:bool, reprintQty, reprintOriginal }.
// Legacy shape ({ qty }|{ meters }) is read defensively and treated as a manual
// override with no reprint provenance (legacy reprints were stored as overrides).
export const normalizeOverrideEntry = (entry) => {
  if (!entry) return null;
  if (entry.printed) {
    return {
      printed: entry.printed,
      manual: entry.manual === true,
      reprintQty: entry.reprintQty ?? null,
      reprintOriginal: entry.reprintOriginal ?? null,
    };
  }
  if (entry.qty != null || entry.meters != null) {
    return {
      printed: entry.meters != null ? { meters: entry.meters } : { qty: entry.qty },
      manual: true,
      reprintQty: null,
      reprintOriginal: null,
    };
  }
  return null;
};

const getDayLabel = (dateStr) => {
  const [d, mo, y] = dateStr.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return null;
};

export const readSingleBatch = async (batchPath, meta) => {
  const entries = await fs.promises.readdir(batchPath, { withFileTypes: true });

  let batchOverrides = {};
  try {
    const raw = await fs.promises.readFile(path.join(batchPath, "_batch_info.json"), "utf8");
    const info = JSON.parse(raw);
    batchOverrides = info.overrides ?? {};
  } catch {
    // no _batch_info.json or no overrides field — safe to ignore
  }

  let xmlExists = false;
  const activeFiles = [];
  const parsedForLength = [];

  for (const f of entries) {
    if (!f.isFile()) continue;
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".xml")) {
      xmlExists = true;
      continue;
    }
    if (lower.endsWith(".pdf")) {
      const filePath = path.join(batchPath, f.name);
      const parsed = parsePrintFileName(f.name, { fullPath: filePath, dir: batchPath, shopConfig: getProfile() });
      const stem = path.parse(f.name).name;
      const prov = normalizeOverrideEntry(batchOverrides[stem]);
      activeFiles.push({
        name: f.name,
        path: filePath,
        type: parsed?.printTypeCode || "UNKNOWN",
        orderId: parsed?.orderId || null,
        // Manual override value shown only when the operator actually overrode.
        manualOverride: prov?.manual ? prov.printed : null,
        // Reprint provenance from _batch_info (preferred over open requests below).
        reprintQty: prov?.reprintQty ?? null,
        reprintQtyOriginal: prov?.reprintOriginal ?? null,
      });
      if (parsed?.status === FILE_STATUS.READY) {
        // Group metres must reflect the effective printed amount, not the parsed
        // original — overlay printed (override or reprint) before estimating.
        const forLength = { ...parsed, materialType: getMaterialType(parsed.material) };
        if (prov?.printed?.meters != null) forLength.height = Math.round(prov.printed.meters * 1000);
        else if (prov?.printed?.qty != null) forLength.qty = prov.printed.qty;
        parsedForLength.push(forLength);
      }
    }
  }

  const files = [...activeFiles];
  try {
    const raw = await fs.promises.readFile(path.join(batchPath, "_rollback_snapshot.json"), "utf8");
    const snapshot = JSON.parse(raw);
    const activeNames = new Set(activeFiles.map((f) => f.name));
    for (const fname of snapshot.files || []) {
      if (activeNames.has(fname)) continue;
      const parsed = parsePrintFileName(fname, { fullPath: path.join(batchPath, fname), dir: batchPath, shopConfig: getProfile() });
      const fstem = path.parse(fname).name;
      const prov = normalizeOverrideEntry(batchOverrides[fstem]);
      files.push({
        name: fname,
        path: path.join(batchPath, fname),
        type: parsed?.printTypeCode || "UNKNOWN",
        orderId: parsed?.orderId || null,
        status: FILE_STATUS.ROLLED_BACK,
        rolledBackAt: snapshot.rolledBackAt || null,
        manualOverride: prov?.manual ? prov.printed : null,
        reprintQty: prov?.reprintQty ?? null,
        reprintQtyOriginal: prov?.reprintOriginal ?? null,
      });
    }
  } catch {
    // no snapshot or invalid — nothing to merge
  }

  // Attach open reprint request quantities ONLY where _batch_info has no reprint
  // provenance — _batch_info is preferred because BatchHistory is a historical
  // view of this submit and must stay correct even after the request is fulfilled.
  const reprintRows = getOpenReprintRequestsByFileIds(files.map((f) => path.parse(f.name).name));
  if (reprintRows.length > 0) {
    const reprintByStem = new Map(reprintRows.map((r) => [r.file_id, r]));
    for (const f of files) {
      if (f.reprintQty != null) continue;
      const req = reprintByStem.get(path.parse(f.name).name);
      if (req) {
        f.reprintQty = req.qty_affected;
        f.reprintQtyOriginal = req.qty_original;
      }
    }
  }

  const { fixedTotalLengthM } = estimatePrintLength(parsedForLength, getEstimateConfig());

  return {
    name: path.basename(batchPath),
    path: batchPath,
    printer: meta.printer,
    group: meta.group,
    fileCount: activeFiles.length,
    printLengthM: fixedTotalLengthM,
    xmlExists,
    status: activeFiles.length === 0 ? BATCH_STATUS.ROLLED_BACK : BATCH_STATUS.ACTIVE,
    files,
  };
};

const sortDaysDesc = (days) => {
  return [...days].sort((a, b) => {
    const [ad, am, ay] = a.date.split("-").map(Number);
    const [bd, bm, by] = b.date.split("-").map(Number);
    return new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
  });
};

const makeReadError = (err) => ({
  code: err.code || "UNKNOWN_ERROR",
  message: err.message || "Failed to read printed folder.",
  stage: "read_printed",
  type: "Error",
  title: "Failed to load batch history",
});

// Read one day's FULL content (every batch via readSingleBatch). Shared by
// readPrintedFolder and readPrintedDay. Throws on I/O error — callers wrap it.
const buildDayGroup = async (dayFolder) => {
  const dayPath = path.join(getPrintedRootPath(), dayFolder);
  let batchEntries;
  try {
    batchEntries = await fs.promises.readdir(dayPath, { withFileTypes: true });
  } catch (err) {
    // Behaviour unchanged (re-thrown into errors[] by the caller); but the eager-load path
    // in BatchHistory drops that errors[] silently, so log it here first. Same code and key
    // as the readPrintedDays skeleton catch -> deduped across both by logOnce.
    diag(dayPath, {
      type: "error",
      code: "PRINTED_DAY_UNREADABLE",
      message: `Could not read day folder ${dayFolder}`,
      detail: { dayFolder, path: dayPath, ...osFields(err) },
    });
    throw err;
  }

  const batches = (
    await Promise.all(
      batchEntries
        .filter((e) => e.isDirectory())
        .map(async (batchEntry) => {
          const meta = parseBatchFolderName(batchEntry.name);
          if (!meta) {
            const folderPath = path.join(dayPath, batchEntry.name);
            diag(folderPath, {
              type: "warning",
              code: "BATCH_FOLDER_SKIPPED",
              message: `Skipped non-batch folder "${batchEntry.name}"`,
              detail: { path: folderPath, name: batchEntry.name, pattern: BATCH_FOLDER_RE.source },
            });
            return null;
          }
          return readSingleBatch(path.join(dayPath, batchEntry.name), meta);
        }),
    )
  ).filter(Boolean);

  return {
    dayFolder,
    date: dayFolder,
    label: getDayLabel(dayFolder),
    totalBatches: batches.length,
    totalFiles: batches.reduce((s, b) => s + b.fileCount, 0),
    batches,
    loaded: true,
  };
};

export const readPrintedFolder = async () => {
  const result = { success: false, data: [], errors: [] };

  try {
    const printedRoot = getPrintedRootPath();

    try {
      await fs.promises.access(printedRoot);
    } catch (err) {
      // Return value UNCHANGED (success, empty) - "no batches yet" vs "root unreachable" is
      // an operator-facing distinction and a separate decision; here we only leave a trace.
      diag(printedRoot, {
        type: "error",
        code: "PRINTED_ROOT_UNREACHABLE",
        message: `PRINTED root unreachable: ${printedRoot}`,
        detail: { path: printedRoot, ...osFields(err) },
      });
      result.success = true;
      return result;
    }

    const dayEntries = await fs.promises.readdir(printedRoot, { withFileTypes: true });

    const dayGroups = await Promise.all(
      dayEntries
        .filter((e) => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
        .map((dayEntry) => buildDayGroup(dayEntry.name)),
    );

    result.success = true;
    result.data = sortDaysDesc(dayGroups);
  } catch (err) {
    result.errors = [makeReadError(err)];
  }

  return result;
};

// Lazy-load step 1: enumerate days only — ZERO readFile/DB. Returns sorted-desc
// skeletons; per-batch content is fetched on demand via readPrintedDay.
export const readPrintedDays = async () => {
  const result = { success: false, data: [], errors: [] };

  try {
    const printedRoot = getPrintedRootPath();

    try {
      await fs.promises.access(printedRoot);
    } catch (err) {
      // Return value UNCHANGED (success, empty). Same trace as readPrintedFolder; same key.
      diag(printedRoot, {
        type: "error",
        code: "PRINTED_ROOT_UNREACHABLE",
        message: `PRINTED root unreachable: ${printedRoot}`,
        detail: { path: printedRoot, ...osFields(err) },
      });
      result.success = true;
      return result;
    }

    const dayEntries = await fs.promises.readdir(printedRoot, { withFileTypes: true });

    const days = await Promise.all(
      dayEntries
        .filter((e) => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
        .map(async (dayEntry) => {
          // dayFolder/date/label come from the folder name — no I/O, always safe.
          const skeleton = {
            dayFolder: dayEntry.name,
            date: dayEntry.name,
            label: getDayLabel(dayEntry.name),
            totalBatches: 0,
            totalFiles: null,
            batches: [],
            loaded: false,
          };
          const dayPath = path.join(printedRoot, dayEntry.name);
          try {
            const batchEntries = await fs.promises.readdir(dayPath, { withFileTypes: true });
            // Count matching dirs and, in the same pass, leave a trace for any non-batch
            // folder (a batch client would silently vanish from the list otherwise, e.g. a
            // new printer outside the regex). Loose FILES are not batches -> not logged.
            let count = 0;
            for (const e of batchEntries) {
              if (!e.isDirectory()) continue;
              if (parseBatchFolderName(e.name)) {
                count++;
              } else {
                const folderPath = path.join(dayPath, e.name);
                diag(folderPath, {
                  type: "warning",
                  code: "BATCH_FOLDER_SKIPPED",
                  message: `Skipped non-batch folder "${e.name}"`,
                  detail: { path: folderPath, name: e.name, pattern: BATCH_FOLDER_RE.source },
                });
              }
            }
            skeleton.totalBatches = count;
          } catch (err) {
            // One day unreadable (ENOENT/EPERM/EBUSY/EACCES — removed mid-scan or SMB lock)
            // must not sink the whole enumeration: keep it as a 0-batch skeleton, but leave
            // a trace (this catch was silent before). Same code/key as buildDayGroup.
            diag(dayPath, {
              type: "error",
              code: "PRINTED_DAY_UNREADABLE",
              message: `Could not read day folder ${dayEntry.name}`,
              detail: { dayFolder: dayEntry.name, path: dayPath, ...osFields(err) },
            });
          }
          return skeleton;
        }),
    );

    result.success = true;
    result.data = sortDaysDesc(days);
  } catch (err) {
    result.errors = [makeReadError(err)];
  }

  return result;
};

// Lazy-load step 2: full content of ONE day (reuses readSingleBatch via buildDayGroup).
export const readPrintedDay = async (dayFolder) => {
  const result = { success: false, data: null, errors: [] };

  try {
    result.data = await buildDayGroup(dayFolder);
    result.success = true;
  } catch (err) {
    result.errors = [makeReadError(err)];
  }

  return result;
};
