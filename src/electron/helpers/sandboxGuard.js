// Fail-closed check for the dev sandbox: which settings would make an app run from the repo
// touch anything outside its local sandbox? main.js refuses to start while this returns a
// non-empty list - the config is not trusted, it is checked.
//
// A WHITE list, not a black list: a path is safe only if it is absolute and lies under the
// sandbox root. Blacklisting "network" paths does not work - a drive letter can be mapped to
// anything (F: is a local disk on Cotton PC and could be a share elsewhere), and detecting a
// mapped drive needs OS calls. UNC and O: get their own reason only so the refusal message
// says WHY in the two cases that actually point at production.
//
// Zero imports beyond path. path.win32 on purpose: RipFlow is Windows-only, and the
// comparison must behave the same when the tests run on another OS.
import path from "node:path";

const win = path.win32;

// Every key getSettings() returns is classified here; sandboxGuard.test.js fails when a new
// key appears without a classification, so a new path setting cannot slip past the guard.
export const PATH_SETTING_KEYS = Object.freeze(["storagePath", "xmlPath", "customOrderFolderPath"]);
export const NON_PATH_SETTING_KEYS = Object.freeze([
  "workstationName",
  "labelPrinterName", // a printer device name, not a path - label printing is blocked in labelPrinter.js
  "workstationRole",
  "shippedRetentionDays",
  "batchHistoryEagerDays",
  "labelPrintMode",
  "clientId",
]);

// true when `value` resolves to `root` or somewhere below it (case-insensitive, like Windows).
const isUnder = (value, root) => {
  const rel = win.relative(win.resolve(root).toLowerCase(), win.resolve(value).toLowerCase());
  if (rel === "") return true;
  return rel.split(win.sep)[0] !== ".." && !win.isAbsolute(rel);
};

// -> [{ key, value, reason }]; empty list = safe to start.
export const findUnsafeSettings = (settings, sandboxRoot) => {
  const unsafe = [];
  for (const key of PATH_SETTING_KEYS) {
    const value = settings?.[key];
    if (value === "") continue; // empty is allowed (customOrderFolderPath is "" when unused)
    let reason = null;
    if (typeof value !== "string") reason = "not a string";
    else if (/^[\\/]{2}/.test(value)) reason = "UNC network path";
    else if (/^o:/i.test(value)) reason = "production drive O:";
    else if (!win.isAbsolute(value) || /^[a-z]:(?![\\/])/i.test(value)) reason = "not an absolute path";
    else if (typeof sandboxRoot !== "string" || sandboxRoot === "") reason = "no sandbox root";
    else if (!isUnder(value, sandboxRoot)) reason = "outside the sandbox";
    if (reason) unsafe.push({ key, value, reason });
  }
  return unsafe;
};
