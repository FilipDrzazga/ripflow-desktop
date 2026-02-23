import fs from "fs";
import path from "path";
import { getRootPath } from "../helpers/getRootPath.js";
import { isPDF } from "../helpers/isPDF.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getMaterialType } from "../helpers/getMaterialType.js";

export const readFolders = async () => {
  try {
    const PATH = getRootPath();
    // check if the FOLDERS path exist
    const isFolderExist = await fs.promises.stat(PATH);
    if (!isFolderExist.isDirectory()) throw new Error("Folder does not exist");
    // read all folders in MAIN folder
    const readMainFolder = await fs.promises.readdir(PATH, { withFileTypes: true });

    // read all subfolders and files inside
    const readSubFolders = readMainFolder.map(async (folder) => {
      if (folder.isDirectory()) {
        const getJobsInside = await fs.promises.readdir(path.join(PATH, folder.name), { withFileTypes: true });

        const jobs = getJobsInside.map(async (job) => {
          if (job.isFile()) {
            const ispdf = await isPDF(path.join(PATH, folder.name, job.name));
            if (!ispdf) return null;
            const meta = parsePrintFileName(job.name, { fullPath: path.join(PATH, folder.name, job.name), dir: PATH });
            if (!meta) return null;
            return {
              id: `${folder.name}_${job.name}`,
              printGroup: folder.name,
              materialType: getMaterialType(meta.material),
              ...meta,
            };
          }
        });
        const res = await Promise.all(jobs);
        return res.filter(Boolean);
      }
    });

    const nested = await Promise.all(readSubFolders);
    const files = nested.flat();

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

    return { ok: true, data: groupedByFolderArray };
  } catch (err) {
    return {
      ok: false,
      place: "READ_FOLDER",
      code: "READ_FOLDER_ERROR",
      message: err.message,
    };
  }
};
