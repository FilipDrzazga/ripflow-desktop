import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises the REAL db.js, like db.shopProfile.test.js, and for the same reason: every
// other test in the profile suite replaces this module wholesale.
//
// WHAT THIS IS NOT: a test against real SQLite. The driver is a fake, so what is verified
// is db.js's control flow plus the SEMANTICS of the compare-and-swap, which the fake
// implements honestly - it compares the incoming expected text against what it holds and
// reports changes accordingly. Whether the SQL string is valid SQLite is not in scope.

let stored;
let lastRun;

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {}
    prepare(sql) {
      return {
        all: () => [],
        get: () => {
          // Keeps initDb's seeds out of the way; see db.shopProfile.test.js.
          if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
          if (/FROM shop_profile/.test(sql)) return stored === null ? undefined : { data: stored };
          return undefined;
        },
        run: (...args) => {
          if (/UPDATE shop_profile/.test(sql)) {
            const [nextJson, updatedAt, updatedBy, expectedJson] = args;
            lastRun = { nextJson, updatedAt, updatedBy, expectedJson };
            // The fake reads the WHERE clause instead of assuming one, because the guard
            // is the thing under test. An UNGUARDED update has to CLOBBER here, the way
            // SQLite would - a fake that reported changes:0 for it would let the guard be
            // deleted with the one test that names the danger still passing.
            const guarded = /WHERE id = 1 AND data = ?/.test(sql);
            if (!guarded) {
              stored = nextJson;
              return { changes: 1 };
            }
            if (expectedJson === stored) {
              stored = nextJson;
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          return { changes: 0 };
        },
      };
    }
    transaction(fn) {
      return (...a) => fn(...a);
    }
  },
}));

import { initDb, getShopProfileRaw, migrateShopProfileRow } from "./db.js";
import { migrateShopProfile } from "./migrateShopProfile.js";

const PRE_2F = { schemaVersion: 1, printers: [{ code: "DGEN" }], workstationRoles: ["cotton"] };

beforeEach(() => {
  stored = JSON.stringify(PRE_2F);
  lastRun = null;
  initDb();
});

describe("getShopProfileRaw", () => {
  it("returns the column text itself, not a parsed object", () => {
    const raw = getShopProfileRaw();
    expect(typeof raw).toBe("string");
    expect(raw).toBe(stored);
  });

  it("returns null when there is no row", () => {
    stored = null;
    expect(getShopProfileRaw()).toBeNull();
  });

  // Z3, at the level where the string is produced. If this ever starts round-tripping
  // through JSON, the compare-and-swap below silently stops matching.
  it("preserves formatting that a round trip would destroy", () => {
    stored = JSON.stringify(PRE_2F, null, 2);
    const raw = getShopProfileRaw();
    expect(raw).toBe(stored);
    expect(raw).not.toBe(JSON.stringify(JSON.parse(raw)));
  });
});

describe("migrateShopProfileRow - compare and swap", () => {
  it("writes and reports updated:true when the row is untouched", () => {
    const raw = getShopProfileRaw();
    const { profile } = migrateShopProfile(JSON.parse(raw));
    const next = JSON.stringify(profile);

    const res = migrateShopProfileRow(raw, next, "migration:v2");

    expect(res).toEqual({ updated: true });
    expect(JSON.parse(stored).scanRules).toHaveLength(4);
    expect(JSON.parse(stored).workstationRoles).toBeUndefined();
    expect(lastRun.updatedBy).toBe("migration:v2");
  });

  it("reports updated:false and writes nothing when the row changed underneath", () => {
    const raw = getShopProfileRaw();
    // Another station migrates, or a person saves a profile, between our read and write.
    stored = JSON.stringify({ schemaVersion: 2, scanRules: [{ role: "qc" }] });
    const before = stored;

    const res = migrateShopProfileRow(raw, JSON.stringify({ schemaVersion: 2 }), "migration:v2");

    expect(res).toEqual({ updated: false });
    expect(stored).toBe(before);
  });

  // The corpse for "pass JSON.stringify(parsed) instead of the raw text". With a
  // pretty-printed column this matches nothing, and the migration would never run.
  it("matches nothing when handed a re-serialisation instead of the original text", () => {
    stored = JSON.stringify(PRE_2F, null, 2);
    const raw = getShopProfileRaw();

    const withRaw = migrateShopProfileRow(raw, "{}", "migration:v2");
    expect(withRaw).toEqual({ updated: true });

    stored = JSON.stringify(PRE_2F, null, 2);
    const reserialised = JSON.stringify(JSON.parse(getShopProfileRaw()));
    const withReserialised = migrateShopProfileRow(reserialised, "{}", "migration:v2");
    expect(withReserialised).toEqual({ updated: false });
  });
});
