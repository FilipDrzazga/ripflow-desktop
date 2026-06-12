import fs from "fs";
import path from "path";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { estimatePrintLength } from "../../shared/estimatePrintLength.js";
import { BATCH_STATUS, FILE_STATUS } from "../../shared/constants.js";

const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;
const BATCH_FOLDER_RE = /^PRINTED_\d{6}-(.+)-(DGEN|YOKO|YUMI)$/;

export const parseBatchFolderName = (name) => {
  const m = name.match(BATCH_FOLDER_RE);
  if (!m) return null;
  return { group: m[1], printer: m[2] };
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
      activeFiles.push({
        name: f.name,
        path: filePath,
        type: parsed?.printTypeCode || "UNKNOWN",
        orderId: parsed?.orderId || null,
        qtyOverride: batchOverrides[stem]?.qty ?? null,
        metersOverride: batchOverrides[stem]?.meters ?? null,
      });
      if (parsed?.status === FILE_STATUS.READY) {
        parsedForLength.push({ ...parsed, materialType: getMaterialType(parsed.material) });
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
      files.push({
        name: fname,
        path: path.join(batchPath, fname),
        type: parsed?.printTypeCode || "UNKNOWN",
        orderId: parsed?.orderId || null,
        status: FILE_STATUS.ROLLED_BACK,
        rolledBackAt: snapshot.rolledBackAt || null,
        qtyOverride: batchOverrides[fstem]?.qty ?? null,
        metersOverride: batchOverrides[fstem]?.meters ?? null,
      });
    }
  } catch {
    // no snapshot or invalid — nothing to merge
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
