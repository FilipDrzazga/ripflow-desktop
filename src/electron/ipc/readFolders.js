import fs from "fs";
import path from "path";
import { getRootPath } from "../helpers/getRootPath.js";
import { isPDF } from "../helpers/isPDF.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { getFileAgeInDays } from "../helpers/getFileAgeInDays.js";
import { getOpenReprintRequestsByFileIds } from "../helpers/db.js";

const STAGES = {
  INIT: "init",
  VALIDATE_ROOT: "validate_root",
  READ_MAIN: "read_main",
  READ_SUBFOLDERS: "read_subfolders",
  GROUP: "group",
  DONE: "done",
};

const toReadFoldersError = (error, stage, fallbackTitle = "Read folders failed") => ({
  code: error.code || "UNKNOWN_ERROR",
  message: error.message || "An unknown error occurred.",
  stage: error.stage || stage || "unknown",
  type: error.type || "Error",
  title: error.title || fallbackTitle,
});

export const readFolders = async ({ onProgress } = {}) => {
  const result = {
    success: false,
    data: [],
    errors: [],
    warnings: [],
  };
  let stage = STAGES.INIT;

  const progress = (label, percent) => {
    if (typeof onProgress === "function") onProgress({ label, percent });
  };

  try {
    progress("Detecting main folder...", 0);
    stage = STAGES.VALIDATE_ROOT;
    const PATH = getRootPath();
    let rootStat;

    try {
      rootStat = await fs.promises.stat(PATH);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw Object.assign(new Error(`Root folder does not exist: ${PATH}`), {
          code: "ENOENT",
          stage,
          title: "Invalid root folder",
        });
      }
      throw err;
    }

    if (!rootStat.isDirectory()) {
      throw Object.assign(new Error(`Root path is not a directory: ${PATH}`), {
        code: "ENOTDIR",
        stage,
        title: "Invalid root folder",
      });
    }

    stage = STAGES.READ_MAIN;
    const readMainFolder = await fs.promises.readdir(PATH, { withFileTypes: true });

    progress("Reading and parsing files...", 30);
    stage = STAGES.READ_SUBFOLDERS;
    // Defensive scan: a single unreadable file/folder must never zero the whole inbox.
    // Skipped entries are collected here and surfaced to the operator via result.warnings.
    const warnings = [];
    const readSubFolders = readMainFolder.map(async (folder) => {
      if (!folder.isDirectory()) return [];
      const folderPath = path.join(PATH, folder.name);

      let getJobsInside;
      try {
        getJobsInside = await fs.promises.readdir(folderPath, { withFileTypes: true });
      } catch (err) {
        // Folder vanished / permission error — skip it, keep scanning the rest.
        warnings.push(`Skipped folder "${folder.name}" (${err.code || "ERROR"})`);
        return [];
      }

      const jobs = getJobsInside.map(async (job) => {
        try {
          if (!job.isFile()) return null;
          const fullPath = path.join(folderPath, job.name);
          let fileStats;
          try {
            fileStats = await fs.promises.stat(fullPath);
          } catch (err) {
            if (err.code === "ENOENT") return null;
            throw err;
          }
          if (fileStats.size === 0) return null;
          const ispdf = await isPDF(fullPath);
          if (!ispdf) return null;
          const meta = parsePrintFileName(job.name, {
            fullPath,
            dir: folderPath,
          });
          if (!meta) return null;
          return {
            id: `${folder.name}_${job.name}`,
            printGroup: folder.name,
            materialType: getMaterialType(meta.material),
            createdAt: fileStats.birthtime,
            diffDays: getFileAgeInDays(fileStats),
            fileSizeBytes: fileStats.size,
            ...meta,
          };
        } catch (err) {
          // Unreadable / unparseable file — skip it, keep the rest of the folder.
          warnings.push(`Skipped file "${folder.name}/${job.name}" (${err.code || "ERROR"})`);
          return null;
        }
      });
      const res = await Promise.all(jobs);
      return res.filter(Boolean);
    });

    const nested = await Promise.all(readSubFolders);
    const files = nested.flat();
    result.warnings = warnings;

    // Attach open reprint request quantities (unit follows print type: meters for LM, pieces otherwise)
    const stems = files.map((f) => path.parse(f.file.name).name);
    const reprintRows = getOpenReprintRequestsByFileIds(stems);
    if (reprintRows.length > 0) {
      const reprintByStem = new Map(reprintRows.map((r) => [r.file_id, r]));
      for (const f of files) {
        const req = reprintByStem.get(path.parse(f.file.name).name);
        if (req) {
          f.reprintQty = req.qty_affected;
          f.reprintQtyOriginal = req.qty_original;
        }
      }
    }

    progress("Grouping files...", 80);
    stage = STAGES.GROUP;

    const groupedByFolder = files.reduce((acc, item) => {
      const key = item.printGroup;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const groupedByFolderArray = Object.entries(groupedByFolder).map(([printGroup, items]) => ({
      printGroup,
      items,
      count: items.length,
    }));

    progress("Done!", 100);
    result.success = true;
    result.data = groupedByFolderArray;
    stage = STAGES.DONE;
    return result;
  } catch (err) {
    result.errors.push(toReadFoldersError(err, stage));
    progress("Failed to load folders", 100);
    return result;
  }
};
