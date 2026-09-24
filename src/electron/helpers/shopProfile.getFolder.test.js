import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 2d-2: getFolder(name) - a folder name from profile.folders, or null. The DB edge is
// mocked exactly as in shopProfile.test.js; the cache under test is the real one.
let dbBehaviour = () => null;

vi.mock("./db.js", () => ({
  getShopProfile: () => dbBehaviour(),
}));

import { loadShopProfile, invalidateShopProfile, getFolder } from "./shopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

const load = (row) => {
  dbBehaviour = () => row;
  loadShopProfile();
};

beforeEach(() => {
  dbBehaviour = () => null;
  invalidateShopProfile();
});

describe("getFolder", () => {
  it("returns the named folder from the loaded profile", () => {
    load({ folders: { ripError: "PF_ERRORS", customOrder: "MINERVA_IN" } });
    expect(getFolder("ripError")).toBe("PF_ERRORS");
    expect(getFolder("customOrder")).toBe("MINERVA_IN");
  });

  it("profile not loaded -> null, never the default profile's folder (rule 24)", () => {
    expect(getFolder("ripError")).toBeNull();
    dbBehaviour = () => {
      throw new Error("NAS gone");
    };
    loadShopProfile();
    expect(getFolder("ripError")).toBeNull();
  });

  it("no row on a healthy DB -> DEFAULT_PROFILE stands in, as for every other reader", () => {
    load(null);
    expect(getFolder("ripError")).toBe(DEFAULT_PROFILE.folders.ripError);
  });

  it("missing key, missing or malformed folders -> null", () => {
    load({ folders: { ripError: "PF_ERRORS" } });
    expect(getFolder("customOrder")).toBeNull();
    load({ printers: [] });
    expect(getFolder("ripError")).toBeNull();
    load({ folders: "PF_ERRORS" });
    expect(getFolder("ripError")).toBeNull();
    load({ folders: null });
    expect(getFolder("ripError")).toBeNull();
  });

  it("a value that is not ONE plain folder name -> null (same check as printers[].hotfolder)", () => {
    for (const bad of ["..", "a\\b", "a/b", "", 5, { x: 1 }]) {
      load({ folders: { ripError: bad } });
      expect(getFolder("ripError")).toBeNull();
    }
  });

  it("reads the key it is asked for, not a fixed one", () => {
    load({ folders: { ripError: "ONE", customOrder: "TWO" } });
    expect(getFolder("customOrder")).toBe("TWO");
    expect(getFolder("printed")).toBeNull();
  });
});
