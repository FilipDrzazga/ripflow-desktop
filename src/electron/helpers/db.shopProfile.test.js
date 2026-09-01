import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises the REAL db.js — deliberately, because this is the one module the rest of
// the profile suite is blind to: shopProfile.test.js does vi.mock("./db.js"), so it
// replaces exactly the code under test here.
//
// WHAT THIS IS NOT: a test against real SQLite. better-sqlite3 is replaced by a fake
// driver, so what is verified is db.js's CONTROL FLOW — which branch of getShopProfile
// runs for a missing handle, a missing row and a present row — not that any SQL is
// valid or that the schema is right. A driver method added to initDb later will break
// the fake before it breaks anything real; that is the price of reaching db.js at all.
//
// Three mocks, all infrastructure: electron and getRootPath.js (whose chain reaches
// electron-store, which throws "Please specify the `projectName` option" outside
// Electron), plus the native driver. Same convention as normalizeOverrideEntry.test.js.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

// The row SELECT ... FROM shop_profile will find. Set per test; undefined = no row,
// which is what better-sqlite3's .get() returns for an empty result.
let profileRow;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {}
    prepare(sql) {
      return {
        // PRAGMA table_info(fabrics) and every catalog read: empty is fine here.
        all: () => [],
        get: () => {
          // initDb seeds fabrics / fabric_globals / shop_profile only when the count is
          // 0. Reporting a non-zero count keeps the seed out of the way. Returning
          // undefined here instead would throw on `.c` INSIDE initDb's try, which
          // silently sets db = null and would fake a passing "throws" case.
          if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
          if (/FROM shop_profile/.test(sql)) return profileRow;
          return undefined;
        },
        run: () => ({ changes: 0 }),
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
  },
}));

import { initDb, getShopProfile } from "./db.js";

describe("getShopProfile — three states of the real db.js", () => {
  beforeEach(() => {
    profileRow = undefined;
  });

  // db.js keeps its handle in module state, so this case has to run before initDb.
  it("THROWS when the database was never initialized", () => {
    expect(() => getShopProfile()).toThrow(/database not initialized/);
  });

  it("returns null when the database is readable but holds no row", () => {
    initDb();
    profileRow = undefined;
    expect(getShopProfile()).toBeNull();
  });

  it("returns the parsed profile when the row is present", () => {
    initDb();
    profileRow = { data: JSON.stringify({ schemaVersion: 1, features: { shopify: true } }) };
    expect(getShopProfile()).toEqual({ schemaVersion: 1, features: { shopify: true } });
  });

  it("THROWS when the row is present but its JSON is corrupt", () => {
    // The contract's second throwing path: the handle is fine and a row came back, but
    // it cannot be read. Real causes are a hand-edited ripflow.db and a truncated write.
    // Swallowing this into null would report "fresh install" and hand back
    // DEFAULT_PROFILE against a database that is perfectly alive.
    initDb();
    profileRow = { data: "{ not json" };
    expect(() => getShopProfile()).toThrow();
  });
});
