import { getSettings } from "./getSettings.js";

// The RIP-error folder name is no longer here: it is shop-profile data (folders.ripError,
// ETAP 2d-3), resolved in ipc/ripErrorHandlers.js. This file must not import shopProfile.js -
// db.js imports this file, so that would be a cycle.

export const getStorageRootPath = () => {
  return getSettings().storagePath;
};

export const getXmlRootPath = () => {
  return getSettings().xmlPath;
};

export const getRootPath = () => {
  return getStorageRootPath();
};
