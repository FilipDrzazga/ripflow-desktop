import fs from "fs";
import path from "path";
import { getRootPath } from "../helpers/getRootPath.js";
import { isPDF } from "../helpers/isPDF.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";
import { getFileAgeInDays } from "../helpers/getFileAgeInDays.js";

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
    const readSubFolders = readMainFolder.map(async (folder) => {
      if (!folder.isDirectory()) return [];
      const folderPath = path.join(PATH, folder.name);
      const getJobsInside = await fs.promises.readdir(folderPath, { withFileTypes: true });

      const jobs = getJobsInside.map(async (job) => {
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
      });
      const res = await Promise.all(jobs);
      return res.filter(Boolean);
    });

    const nested = await Promise.all(readSubFolders);
    const files = nested.flat();

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
