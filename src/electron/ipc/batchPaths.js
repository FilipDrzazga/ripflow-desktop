import path from "node:path";
import { getRootPath } from "../helpers/getRootPath.js";

export const getBatchPaths = ({ day, batchId }) => {
  const PATH = getRootPath();
  const printedDayDir = path.join(PATH, "PRINTED", day);
  const batchRoot = path.join(printedDayDir, batchId);

  return {
    printedDayDir,
    batchRoot,
    sourceDir: path.join(batchRoot, "source"),
    readyDir: path.join(batchRoot, "ready"),
    nestedDir: path.join(batchRoot, "nested"),
    logsDir: path.join(batchRoot, "logs"),
    manifestPath: path.join(batchRoot, "manifest.json"),
  };
};
