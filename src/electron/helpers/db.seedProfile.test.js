import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 3-6: initDb seeds the EMPTY profile skeleton - and only into an empty shop_profile table.
// Exercises the real db.js with a fake driver (same convention and the same limits as
// db.shopProfile.test.js: db.js's control flow, not SQLite). The point is the guard: every station
// runs initDb against the SHARED database on every start, so the seed must never reach a table
// that already holds a shop's profile (Alex's row, 2026-09-28: COUNT = 1).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

const h = vi.hoisted(() => ({ profileCount: 1, runs: [] }));

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
          // only shop_profile's count varies; every other seed stays out of the way
          if (/COUNT\(\*\)/.test(sql)) return { c: /FROM shop_profile/.test(sql) ? h.profileCount : 1 };
          return undefined;
        },
        run: (...args) => {
          h.runs.push({ sql, args });
          return { changes: 1 };
        },
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
  },
}));

import { initDb } from "./db.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

const profileInserts = () => h.runs.filter((r) => /INSERT INTO shop_profile/.test(r.sql));

beforeEach(() => {
  h.runs = [];
});

describe("initDb - the shop profile seed", () => {
  it("an empty table gets the skeleton: no printer, every feature off", () => {
    h.profileCount = 0;
    initDb();
    const inserts = profileInserts();
    expect(inserts).toHaveLength(1);
    const [data, , updatedBy] = inserts[0].args;
    expect(JSON.parse(data)).toEqual(DEFAULT_PROFILE);
    expect(JSON.parse(data).printers).toEqual([]);
    expect(Object.values(JSON.parse(data).features).every((v) => v === false)).toBe(true);
    expect(updatedBy).toBe("system");
  });

  it("a table that already holds a profile is not touched", () => {
    h.profileCount = 1;
    initDb();
    expect(profileInserts()).toEqual([]);
    expect(h.runs.filter((r) => /shop_profile/.test(r.sql) && !/CREATE TABLE/.test(r.sql))).toEqual([]);
  });
});
