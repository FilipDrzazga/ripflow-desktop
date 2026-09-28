import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 3-1: profile:set writes only when the stored row is still the profile THIS station loaded.
// The cache under test is the real shopProfile.js; db.js is a stateful fake holding ONE row as
// column text, so "another station saved in between" is just a change to that text between
// loadShopProfile() and saveShopProfile(). The fake's CAS compares the expected text honestly.

const h = vi.hoisted(() => ({
  row: null, // the column text, or null = no row
  throwOnRead: false,
  throwOnWrite: false,
  beforeWrite: null, // a save by another station landing between the read and the write
  writes: [],
}));

vi.mock("./db.js", () => ({
  getShopProfile: () => {
    if (h.throwOnRead) throw new Error("SQLITE_IOERR");
    return h.row === null ? null : JSON.parse(h.row);
  },
  getShopProfileRaw: () => {
    if (h.throwOnRead) throw new Error("SQLITE_IOERR");
    return h.row;
  },
  migrateShopProfileRow: (expectedJson, nextJson, workstation) => {
    if (h.throwOnWrite) throw new Error("SQLITE_BUSY");
    if (h.beforeWrite) h.beforeWrite();
    h.writes.push({ expectedJson, nextJson, workstation });
    if (h.row !== expectedJson) return { updated: false };
    h.row = nextJson;
    return { updated: true };
  },
}));

import { saveShopProfile } from "./saveShopProfile.js";
import { loadShopProfile, invalidateShopProfile, getProfile } from "./shopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

const A = { schemaVersion: 3, printers: [{ code: "AAA" }], materialClasses: [{ name: "Cottons", margin: 10 }] };
const withMargin = (margin) => ({ ...A, materialClasses: [{ name: "Cottons", margin }] });

beforeEach(() => {
  h.row = JSON.stringify(A);
  h.throwOnRead = false;
  h.throwOnWrite = false;
  h.beforeWrite = null;
  h.writes = [];
  invalidateShopProfile();
  loadShopProfile();
});

describe("saveShopProfile - the row is still the one this station loaded", () => {
  it("writes, and the cache holds the saved profile", () => {
    expect(saveShopProfile(withMargin(12), "PC-1")).toEqual({ success: true });
    expect(JSON.parse(h.row)).toEqual(withMargin(12));
    expect(getProfile()).toEqual(withMargin(12));
    expect(h.writes[0].workstation).toBe("PC-1");
  });

  it("compares the loaded profile as data - a row with the same content in another key order still writes", () => {
    h.row = JSON.stringify({ materialClasses: A.materialClasses, printers: A.printers, schemaVersion: 3 });
    expect(saveShopProfile(withMargin(12), "PC-1")).toEqual({ success: true });
  });

  it("swaps against the exact row text it read, not a re-serialisation", () => {
    h.row = JSON.stringify(A, null, 2);
    invalidateShopProfile();
    loadShopProfile();
    saveShopProfile(withMargin(12), "PC-1");
    expect(h.writes[0].expectedJson).toBe(JSON.stringify(A, null, 2));
  });
});

describe("saveShopProfile - another station saved after this one loaded (the lost update)", () => {
  it("refuses with PROFILE_CHANGED, leaves the other station's row, and reloads it", () => {
    h.row = JSON.stringify(withMargin(99)); // station B saved; this station still holds A
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res.success).toBe(false);
    expect(res.code).toBe(PROFILE_CHANGED);
    expect(JSON.parse(h.row)).toEqual(withMargin(99));
    expect(h.writes).toEqual([]);
    expect(getProfile()).toEqual(withMargin(99));
  });

  it("refuses when the save lands between the read and the write (the swap misses)", () => {
    h.beforeWrite = () => {
      h.row = JSON.stringify(withMargin(99));
    };
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res.code).toBe(PROFILE_CHANGED);
    expect(JSON.parse(h.row)).toEqual(withMargin(99));
    expect(getProfile()).toEqual(withMargin(99));
  });

  it("refuses when the row this station loaded is gone", () => {
    h.row = null;
    expect(saveShopProfile(withMargin(12), "PC-1").code).toBe(PROFILE_CHANGED);
    expect(h.writes).toEqual([]);
  });

  it("refuses when the row was rewritten into text that is not JSON", () => {
    h.row = "{not json";
    expect(saveShopProfile(withMargin(12), "PC-1").code).toBe(PROFILE_CHANGED);
    expect(h.writes).toEqual([]);
  });
});

describe("saveShopProfile - nothing to compare against, or the DB fails", () => {
  it("refuses without a code when this station never loaded a profile", () => {
    h.throwOnRead = true;
    invalidateShopProfile();
    loadShopProfile();
    h.throwOnRead = false;
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res.success).toBe(false);
    expect(res.code).toBeUndefined();
    expect(h.writes).toEqual([]);
  });

  it("refuses when the cache is the in-memory stand-in for a missing row", () => {
    h.row = null;
    invalidateShopProfile();
    loadShopProfile();
    expect(getProfile()).toBe(DEFAULT_PROFILE);
    h.row = JSON.stringify(A);
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res.success).toBe(false);
    expect(res.code).toBeUndefined();
    expect(h.writes).toEqual([]);
  });

  it("a failed read is a failure, not PROFILE_CHANGED", () => {
    h.throwOnRead = true;
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res).toEqual({ success: false, error: "SQLITE_IOERR" });
  });

  it("a failed write is a failure, not PROFILE_CHANGED, and the cache mirrors the unchanged row", () => {
    h.throwOnWrite = true;
    const res = saveShopProfile(withMargin(12), "PC-1");
    expect(res).toEqual({ success: false, error: "SQLITE_BUSY" });
    expect(getProfile()).toEqual(A);
  });

  it("refuses a value that is not a profile object", () => {
    for (const bad of [null, [], "x"]) {
      expect(saveShopProfile(bad, "PC-1")).toEqual({ success: false, error: "Profile must be an object." });
    }
    expect(h.writes).toEqual([]);
  });
});
