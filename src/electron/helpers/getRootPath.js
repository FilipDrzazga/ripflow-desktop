import { getSettings } from "./getSettings.js";
import { isPathSet, PATHS_NOT_SET_MESSAGE, PATHS_NOT_SET_TITLE } from "../../shared/requiredPaths.js";

// The RIP-error folder name is no longer here: it is shop-profile data (folders.ripError,
// ETAP 2d-3), resolved in ipc/ripErrorHandlers.js. This file must not import shopProfile.js -
// db.js imports this file, so that would be a cycle.

// Every path under storagePath / xmlPath is built from these two functions, so this is the
// one place a blank setting is refused (ETAP 2h-3, see src/shared/requiredPaths.js). Callers
// are IPC handlers, initDb and the PRINTED watcher - each already turns a throw into a
// failed call (initDb: no database; the watcher: a backoff retry), none runs unguarded.
const requirePath = (key) => {
  const value = getSettings()[key];
  if (isPathSet(value)) return value;
  throw Object.assign(new Error(PATHS_NOT_SET_MESSAGE), {
    code: "ERR_PATHS_NOT_SET",
    stage: "validate",
    title: PATHS_NOT_SET_TITLE,
    type: "Error",
  });
};

export const getStorageRootPath = () => {
  return requirePath("storagePath");
};

export const getXmlRootPath = () => {
  return requirePath("xmlPath");
};

export const getRootPath = () => {
  return getStorageRootPath();
};
