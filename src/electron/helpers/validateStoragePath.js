import fs from "fs";
import path from "path";
import { getStorageRootPath } from "./getRootPath.js";

const isPathInsideRoot = (targetPath, rootPath) => {
  const relative = path.relative(rootPath, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

export const assertStorageFilePath = async (filePath, { title = "Invalid file path", stage = "validate" } = {}) => {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw Object.assign(new Error("File path is required."), {
      code: "ERR_INVALID_ARG_TYPE",
      stage,
      title,
    });
  }

  const normalizedPath = path.resolve(filePath.trim());
  const storageRootPath = path.resolve(getStorageRootPath());

  if (!isPathInsideRoot(normalizedPath, storageRootPath)) {
    throw Object.assign(new Error(`Path is outside the storage root: ${normalizedPath}`), {
      code: "ERR_PATH_NOT_ALLOWED",
      stage,
      title,
    });
  }

  let stats;
  try {
    stats = await fs.promises.stat(normalizedPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error(`File does not exist: ${normalizedPath}`), {
        code: "ENOENT",
        stage,
        title,
      });
    }

    throw error;
  }

  if (!stats.isFile()) {
    throw Object.assign(new Error(`Path is not a file: ${normalizedPath}`), {
      code: "EISDIR",
      stage,
      title,
    });
  }

  return normalizedPath;
};
