import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 2h-3: getRootPath.js is the one place every storage / XML path is built from, so it
// is where a blank setting is refused. Before 2h-3 the defaults were Alex's network paths;
// now they are "", and a "" handed out would turn every path.join into a RELATIVE path
// (the database, the inbox scan and the XML in the process's working directory).
//
// getSettings.js is mocked: its electron-store throws outside Electron.
let settings = {};
vi.mock("./getSettings.js", () => ({ getSettings: () => settings }));

import { getStorageRootPath, getXmlRootPath, getRootPath } from "./getRootPath.js";

const refusal = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

beforeEach(() => {
  settings = { storagePath: "O:\\Storage", xmlPath: "\\\\srv\\xml" };
});

describe("getRootPath - set paths are handed out unchanged", () => {
  it("returns the storage and XML paths", () => {
    expect(getStorageRootPath()).toBe("O:\\Storage");
    expect(getXmlRootPath()).toBe("\\\\srv\\xml");
    expect(getRootPath()).toBe("O:\\Storage");
  });
});

describe("getRootPath - a blank path is refused, never handed out", () => {
  it("refuses a blank storage path with ERR_PATHS_NOT_SET and the Settings message", () => {
    settings.storagePath = "";
    const err = refusal(getStorageRootPath);
    expect(err?.code).toBe("ERR_PATHS_NOT_SET");
    expect(err?.title).toBe("Paths not set");
    expect(err?.message).toMatch(/Set them in Settings, then restart RipFlow/);
  });

  it("refuses a blank XML path on its own, while storage is set", () => {
    settings.xmlPath = "  ";
    expect(getStorageRootPath()).toBe("O:\\Storage");
    expect(refusal(getXmlRootPath)?.code).toBe("ERR_PATHS_NOT_SET");
  });

  it("getRootPath refuses exactly like the storage path", () => {
    settings.storagePath = undefined;
    expect(refusal(getRootPath)?.code).toBe("ERR_PATHS_NOT_SET");
  });
});
