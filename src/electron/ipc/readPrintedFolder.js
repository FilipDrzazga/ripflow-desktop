import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";
import { getOpenReprintRequestsByFileIds } from "../helpers/db.js";
import { BATCH_STATUS, FILE_STATUS } from "../../shared/constants.js";

const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

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
const normalizeOverrideEntry = (entry) => {
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
      const parsed = parsePrintFileName(f.name, { fullPath: filePath, dir: batchPath });
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
      const parsed = parsePrintFileName(fname, { fullPath: path.join(batchPath, fname), dir: batchPath });
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

  const { fixedTotalLengthM } = estimatePrintLength(parsedForLength);

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

export const readPrintedFolder = async () => {
  const result = { success: false, data: [], errors: [] };

  try {
    const printedRoot = getPrintedRootPath();

    try {
      await fs.promises.access(printedRoot);
    } catch {
      result.success = true;
      return result;
    }

    const dayEntries = await fs.promises.readdir(printedRoot, { withFileTypes: true });

    const dayGroups = await Promise.all(
      dayEntries
        .filter((e) => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
        .map(async (dayEntry) => {
          const dayPath = path.join(printedRoot, dayEntry.name);
          const batchEntries = await fs.promises.readdir(dayPath, { withFileTypes: true });

          const batches = (
            await Promise.all(
              batchEntries
                .filter((e) => e.isDirectory())
                .map(async (batchEntry) => {
                  const meta = parseBatchFolderName(batchEntry.name);
                  if (!meta) return null;
                  const batchPath = path.join(dayPath, batchEntry.name);
                  return readSingleBatch(batchPath, meta);
                }),
            )
          ).filter(Boolean);

          return {
            date: dayEntry.name,
            label: getDayLabel(dayEntry.name),
            totalBatches: batches.length,
            totalFiles: batches.reduce((s, b) => s + b.fileCount, 0),
            batches,
          };
        }),
    );

    result.success = true;
    result.data = sortDaysDesc(dayGroups);
  } catch (err) {
    result.errors = [
      {
        code: err.code || "UNKNOWN_ERROR",
        message: err.message || "Failed to read printed folder.",
        stage: "read_printed",
        type: "Error",
        title: "Failed to load batch history",
      },
    ];
  }

  return result;
};
