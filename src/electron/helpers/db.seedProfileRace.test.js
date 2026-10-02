import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-seed): two stations starting at the same moment on an EMPTY shared database. Both
// read COUNT = 0 before either has inserted, so both run the seed. Before the fix the second
// INSERT hit the PRIMARY KEY, initDb caught it and set db = null - that station ran the whole
// session with no database. Fake driver, same convention as db.seedProfile.test.js: it models
// only what SQLite does with the seed statement - a plain INSERT on an existing id throws,
// one that states ON CONFLICT(id) DO NOTHING changes nothing. The real SQLite behaviour of the
// statement is proven separately (agents/chat/artefakty/4-seed/).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

// one shared "file": whether the profile row exists, and every seed statement that reached it
const h = vi.hoisted(() => ({ rowExists: false, seeds: [] }));

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {}
    prepare(sql) {
      return {
        all: () => [],
        // COUNT is read before either station inserts: 0 for shop_profile, 1 for the other seeds
        get: () => (/COUNT\(\*\)/.test(sql) ? { c: /FROM shop_profile/.test(sql) ? 0 : 1 } : undefined),
        run: () => {
          if (/INTO shop_profile/.test(sql)) {
            h.seeds.push(sql);
            if (h.rowExists) {
              if (/ON CONFLICT\s*\(id\)\s*DO NOTHING/i.test(sql)) return { changes: 0 };
              const err = new Error("UNIQUE constraint failed: shop_profile.id");
              err.code = "SQLITE_CONSTRAINT_PRIMARYKEY";
              throw err;
            }
            h.rowExists = true;
          }
          return { changes: 1 };
        },
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
  },
}));

import { initDb, getShopProfile } from "./db.js";

beforeEach(() => {
  h.rowExists = false;
  h.seeds = [];
});

describe("initDb - two stations seeding an empty database at once", () => {
  it("the second station keeps its database: the seed on an existing id is a no-op, not a throw", () => {
    initDb(); // station A
    initDb(); // station B, which read COUNT = 0 before A inserted
    expect(h.seeds).toHaveLength(2);
    // getShopProfile throws only without a handle (db = null) - the state the race used to leave
    expect(() => getShopProfile()).not.toThrow();
  });

  it("the first station seeds the row", () => {
    initDb();
    expect(h.rowExists).toBe(true);
    expect(h.seeds).toHaveLength(1);
  });
});
