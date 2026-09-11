import { describe, it, expect, vi } from "vitest";

// sandboxGuard.js is pure. The classification test additionally loads the REAL getSettings.js
// with electron-store replaced by a tiny in-memory stand-in that records the defaults - that
// is the only way to read the real key list without Electron.
const h = vi.hoisted(() => ({ defaults: null }));

vi.mock("electron-store", () => ({
  default: class {
    constructor(opts) {
      h.defaults = opts.defaults;
      this.data = { ...opts.defaults };
    }
    get(k) { return this.data[k]; }
    set(k, v) { this.data[k] = v; }
    delete(k) { delete this.data[k]; }
  },
}));

import { findUnsafeSettings, PATH_SETTING_KEYS, NON_PATH_SETTING_KEYS } from "./sandboxGuard.js";
import { getSettings } from "./getSettings.js";

const ROOT = "C:\\Users\\dev\\ripflow-sandbox";
const one = (key, value, root = ROOT) => findUnsafeSettings({ [key]: value, ...fill(key) }, root);
// the other two path keys set to a safe value, so each row tests exactly one key
const fill = (except) =>
  Object.fromEntries(PATH_SETTING_KEYS.filter((k) => k !== except).map((k) => [k, `${ROOT}\\${k}`]));

describe("findUnsafeSettings - paths inside the sandbox are safe", () => {
  it.each([
    ["storagePath", `${ROOT}\\storage`, "a folder under the root"],
    ["xmlPath", ROOT, "the root itself"],
    ["xmlPath", "c:\\users\\DEV\\RIPFLOW-SANDBOX\\xml", "different letter case (Windows is case-insensitive)"],
    ["customOrderFolderPath", "C:/Users/dev/ripflow-sandbox/custom", "forward slashes"],
    ["customOrderFolderPath", "", "empty (feature unused)"],
  ])("%s = %j (%s)", (key, value) => {
    expect(one(key, value)).toEqual([]);
  });
});

describe("findUnsafeSettings - everything else is refused, with the reason", () => {
  it.each([
    ["storagePath", "O:\\SPPrintReadyArtwork", "production drive O:"],
    ["storagePath", "o:\\anything", "production drive O:"],
    ["storagePath", "\\\\FAS-LON-SRV01\\Original_files\\SPPrintReadyArtwork", "UNC network path"],
    ["xmlPath", "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork", "UNC network path"],
    ["xmlPath", "//server/share/xml", "UNC network path"],
    ["customOrderFolderPath", "F:\\Minerva\\HIGH RES\\finals", "outside the sandbox"],
    ["storagePath", "C:\\Users\\dev\\ripflow-sandbox-evil\\storage", "outside the sandbox"],
    ["storagePath", "C:\\Users\\dev\\ripflow-sandbox\\..\\AppData\\Roaming\\ripflow-desktop", "outside the sandbox"],
    ["storagePath", "storage", "not an absolute path"],
    ["storagePath", "C:storage", "not an absolute path"],
    ["storagePath", 42, "not a string"],
    ["xmlPath", null, "not a string"],
    ["xmlPath", undefined, "not a string"],
  ])("%s = %j -> %s", (key, value, reason) => {
    expect(one(key, value)).toEqual([{ key, value, reason }]);
  });

  it("with no sandbox root every non-empty local path is refused", () => {
    // Fail-closed: without a root nothing can be proven inside it - all three keys refused.
    expect(one("storagePath", `${ROOT}\\storage`, null).map((u) => [u.key, u.reason])).toEqual([
      ["storagePath", "no sandbox root"],
      ["xmlPath", "no sandbox root"],
      ["customOrderFolderPath", "no sandbox root"],
    ]);
  });

  it("the live Cotton PC config shape is refused on all three path keys", () => {
    const live = {
      storagePath: "\\\\FAS-LON-SRV01\\Original_files\\SPPrintReadyArtwork",
      xmlPath: "\\\\FAS-LON-SRV01\\Original_files\\SPPrintReadyArtwork",
      customOrderFolderPath: "F:\\Minerva\\HIGH RES\\finals",
      labelPrinterName: "Munbyn RW403B-N",
    };
    expect(findUnsafeSettings(live, ROOT).map((u) => [u.key, u.reason])).toEqual([
      ["storagePath", "UNC network path"],
      ["xmlPath", "UNC network path"],
      ["customOrderFolderPath", "outside the sandbox"],
    ]);
  });

  it("non-path keys are not treated as paths", () => {
    const settings = { ...fill(null), workstationName: "O:\\weird", labelPrinterName: "\\\\printsrv\\label" };
    expect(findUnsafeSettings(settings, ROOT)).toEqual([]);
  });
});

describe("classification - no getSettings key escapes the guard", () => {
  // Harness guard, no mutation corpse of its own: if the electron-store stand-in stops being
  // constructed, the key lists below are empty and the next test would pass vacuously.
  it("the real getSettings.js was loaded through the stand-in", () => {
    expect(h.defaults).not.toBeNull();
  });

  it("every key of getSettings() and of its defaults is classified exactly once", () => {
    const classified = [...PATH_SETTING_KEYS, ...NON_PATH_SETTING_KEYS];
    expect(new Set(classified).size).toBe(classified.length); // no key in both lists
    for (const key of new Set([...Object.keys(getSettings()), ...Object.keys(h.defaults)])) {
      expect(classified, `unclassified settings key "${key}"`).toContain(key);
    }
  });

  it("with the shipped defaults the guard refuses to start (O: and the IP share)", () => {
    expect(findUnsafeSettings(getSettings(), ROOT).map((u) => [u.key, u.reason])).toEqual([
      ["storagePath", "production drive O:"],
      ["xmlPath", "UNC network path"],
    ]);
  });
});
