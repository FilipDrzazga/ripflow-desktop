import fs from "fs";
import path from "path";
import Fuse from "fuse.js";

export function scanCustomOrderFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".tif"))
    .map((e) => path.basename(e.name, path.extname(e.name)));
}

export function matchFiles(parsedCSV, cachedFileNames) {
  const fuseInstance = new Fuse(cachedFileNames, { threshold: 0.3, includeScore: true });

  const files = parsedCSV.files.map((file) => {
    if (cachedFileNames.includes(file.fileName)) {
      return { ...file, found: true, suggestion: null };
    }
    const results = fuseInstance.search(file.fileName);
    const suggestion = results.length > 0 ? results[0].item : null;
    return { ...file, found: false, suggestion };
  });

  return { ...parsedCSV, files };
}
