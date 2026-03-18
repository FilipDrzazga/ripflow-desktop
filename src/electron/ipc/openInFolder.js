import { shell } from "electron";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  OPEN: "open",
  DONE: "done",
};

const toOpenInFolderError = (error, stage, fallbackTitle = "Open folder failed") => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
    title: error.title || fallbackTitle,
  };
};

export const openInFolder = async (filePath) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
  };

  let stage = STAGES.INIT;

  try {
    stage = STAGES.VALIDATE;

    const validatedPath = await assertStorageFilePath(filePath, { stage, title: "Invalid file path" });

    stage = STAGES.OPEN;
    shell.showItemInFolder(validatedPath);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toOpenInFolderError(error, stage));
  }

  return result;
};
