// The two path settings RipFlow cannot work without, and the one answer to "are they set".
// Used by both processes: getRootPath.js refuses to hand out a blank one, App.jsx tells the
// operator at startup (ETAP 2h-3, FILIP 2026-09-25).
//
// Why a refusal and not a default: until 2h-3 getSettings.js defaulted to Alex's network
// paths (O:\SPPrintReadyArtwork and \\192.168.0.17\...), so a fresh install at another shop
// would point at a server it does not have. The defaults are "" now, and "" must not reach
// a path.join: path.join("", "ripflow.db") is a RELATIVE path, so the database would be
// opened (and created) in the process's working directory, the inbox scan would read that
// folder, and the XML would land under the root of the current drive - all silently.
//
// Existing stations are not affected: electron-store writes its defaults into config.json
// on first start, so every station that ever ran keeps the paths it has saved.

export const REQUIRED_PATH_KEYS = Object.freeze(["storagePath", "xmlPath"]);

export const isPathSet = (value) => typeof value === "string" && value.trim() !== "";

export const missingRequiredPaths = (settings) => REQUIRED_PATH_KEYS.filter((key) => !isPathSet(settings?.[key]));

export const PATHS_NOT_SET_TITLE = "Paths not set";
export const PATHS_NOT_SET_MESSAGE =
  "The storage path and the XML path are not set on this computer. Set them in Settings, then restart RipFlow.";
