import fs from "fs";
import path from "path";
import { getRootPath } from "../helpers/getRootPath.js";
import { isPDF } from "../helpers/isPDF.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

export const readFolders = async () => {
  const PATH = getRootPath();
  // read all folders in MAIN folder
  const getJobsFolders = await fs.promises.readdir(PATH, { withFileTypes: true });
  // check if the FOLDERS are directory
  const jobsFolders = getJobsFolders.filter((folder) => folder.isDirectory()).map((folder) => folder.name);
  const results = [];
  //get job files inside each folder
  for (const folder of jobsFolders) {
    const mainPath = path.join(PATH, folder);

    const getFilesInside = await fs.promises.readdir(mainPath, { withFileTypes: true });

    const files = getFilesInside
      .filter((file) => file.isFile())
      .map(async (file) => {
        const ispdf = await isPDF(path.join(mainPath, file.name));
        if (!ispdf) return null;
        return file.name;
      });
    const f = await Promise.all(files);
    f.filter(Boolean).forEach((printJob) => {
      const meta = parsePrintFileName(printJob, { fullPath: path.join(mainPath, printJob) });
      if (!meta) return null;

      results.push({
        id: `${folder}_${printJob}`,
        printFilePath: path.join(mainPath, printJob),
        printFolder: folder,
        ...meta,
      });
    });
  }
  return results;
};
