import fs from "fs";
import path from "path";

export async function scanCustomOrderFolder(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".tif"))
    .map((e) => path.basename(e.name, path.extname(e.name)));
}

export function matchFiles(parsedCSV, cachedFileNames) {
  const files = parsedCSV.files.map((file) => ({
    ...file,
    found: cachedFileNames.includes(file.fileName),
  }));

  return { ...parsedCSV, files };
}
