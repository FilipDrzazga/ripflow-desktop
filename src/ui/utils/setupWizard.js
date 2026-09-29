// First-run wizard (ETAP 4, 4-wizard): what each step SAYS, as pure functions - the view itself only
// wires them to the store and the services (the same cut as shopProfileView.js: the renderer has no
// rendering harness, so this is the part that can carry a test).
//
// The wizard opens at startup instead of the old "Paths not set" notice when a required path is blank
// (src/shared/requiredPaths.js). Steps:
//   1. paths   - storage path and XML path, saved through settings:set (which checks they exist), then
//                "Reload shop data" opens the database on the new storage path without a restart
//   2. profile - the shared profile row: another station may have imported it already; an empty one
//                is imported here through the same two-phase import as Settings > Shop Profile
//   3. folders - a READ check of every folder the station works with (setup:checkFolders, the same
//                list as the diagnostics zip); nothing is written, writing is proven by the first job
// It ends with a restart: the watchers and polls take the paths only at startup.
import { PROFILE_STATUS } from "./profileStatus";
import { isProfileUnconfigured } from "./shopProfileData";

// 4-wizard-c (S2 2026-09-29): the startup inbox scan fails with ERR_PATHS_NOT_SET on a first run
// and its toast says "Set them in Settings, then restart" right over the wizard that is doing
// exactly that. Only THAT toast is dropped, and only while the wizard is open - every other scan
// error still shows; the log entry is written either way.
export const isToastHiddenByWizard = (error, wizardOpen) => wizardOpen === true && error?.code === "ERR_PATHS_NOT_SET";

export const WIZARD_STEPS = Object.freeze([
  { key: "paths", label: "Paths" },
  { key: "profile", label: "Shop profile" },
  { key: "folders", label: "Folders" },
]);

// Step 2's state from the store's load status and profile:
//   "loading"    - not answered yet
//   "unreadable" - the database could not be read (a null profile is a failure, never "empty" - rule 24)
//   "empty"      - read, but no usable printer: the profile has to be imported
//   "ready"      - another station (or an earlier run) already imported it
export const profileStepState = (status, profile) => {
  if (status === PROFILE_STATUS.FAILED) return "unreadable";
  if (status !== PROFILE_STATUS.LOADED || !profile) return "loading";
  return isProfileUnconfigured(profile) ? "empty" : "ready";
};

// Only a ready profile lets the wizard go on - with no printer nothing can be printed.
export const canLeaveProfileStep = (state) => state === "ready";

const READ_PROBLEMS = {
  ENOENT: "Folder does not exist",
  EACCES: "No permission to read it",
  EPERM: "No permission to read it",
  ENOTDIR: "Not a folder",
  EBUSY: "Folder is busy",
  ETIMEDOUT: "Server did not answer",
  EHOSTUNREACH: "Server unreachable",
  ENETUNREACH: "Network unreachable",
};

export const readProblemText = (code) => {
  const text = READ_PROBLEMS[code];
  return text ? `${text} (${code})` : `Cannot read (${code || "unknown error"})`;
};

// setup:checkFolders rows -> what the list shows. A malformed row is a problem, never "ok".
export const folderCheckRows = (folders) =>
  (Array.isArray(folders) ? folders : []).map((f) => {
    const ok = f?.read === "ok";
    return {
      label: String(f?.label ?? "?"),
      path: String(f?.path ?? ""),
      ok,
      message: ok ? "Readable" : readProblemText(f?.read),
    };
  });

export const folderCheckSummary = (rows) => {
  const problems = rows.filter((r) => !r.ok).length;
  if (rows.length === 0) return { tone: "error", text: "No folder to check - the paths are not set." };
  if (problems === 0) return { tone: "ok", text: `All ${rows.length} folders can be read. Writing is proven by the first job.` };
  return {
    tone: "error",
    text: `${problems} of ${rows.length} folders cannot be read. Fix them on the server (or the paths), then check again.`,
  };
};
