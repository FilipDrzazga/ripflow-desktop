import { shell } from "electron";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  OPEN: "open",
  DONE: "done",
};

const toOpenPreviewError = (error, stage, fallbackTitle = "Preview failed") => {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "An unknown error occurred.",
    stage: error.stage || stage || "unknown",
    type: error.type || "Error",
    title: error.title || fallbackTitle,
  };
};

export const openPreview = async (filePath) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
  };

  let stage = STAGES.INIT;

  try {
    stage = STAGES.VALIDATE;

    const validatedPath = await assertStorageFilePath(filePath, { stage, title: "Invalid preview path" });

    stage = STAGES.OPEN;
    const errorMessage = await shell.openPath(validatedPath);

    if (errorMessage) {
      throw Object.assign(new Error(errorMessage), {
        code: "ERR_OPEN_PREVIEW",
        stage,
        title: "Preview failed",
      });
    }

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toOpenPreviewError(error, stage));
  }

  return result;
};
