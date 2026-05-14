import { getSettings } from "./getSettings.js";

export const getStorageRootPath = () => {
  return getSettings().storagePath;
};

export const getXmlRootPath = () => {
  return getSettings().xmlPath;
};

export const getRootPath = () => {
  return getStorageRootPath();
};
