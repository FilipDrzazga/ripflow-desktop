import { join } from "path";
import { getSettings } from "./getSettings.js";

// PrintFactory's Export writes per-failed-job error XML into this folder (sibling of PRINTED/
// under storagePath). Single source of truth for the name — it drifted once already
// (PF renamed it from "WORKFLOW_ERROR" to "AUTOMATION_WORKFLOW_ERROR").
export const RIP_ERROR_FOLDER = "AUTOMATION_WORKFLOW_ERROR";

export const getStorageRootPath = () => {
  return getSettings().storagePath;
};

export const getXmlRootPath = () => {
  return getSettings().xmlPath;
};

export const getRootPath = () => {
  return getStorageRootPath();
};

// {storagePath}\AUTOMATION_WORKFLOW_ERROR — derived, never hardcoded.
export const getRipErrorRootPath = () => join(getStorageRootPath(), RIP_ERROR_FOLDER);
