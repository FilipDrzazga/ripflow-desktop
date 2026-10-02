import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-drop part 2): initDb drops the four retired tables, each on its own, and no longer
// creates fabric_globals. The REAL db.js with a fake driver that records every exec() (the same
// edge as db.fabricGlobalsRaw.test.js). What this does not prove - that SQLite accepts the
// statements on a real file - the live check does (agents/chat/artefakty/4-drop, a copy of Alex's DB).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let execLog;
let failDropOf;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(sql) {
      execLog.push(sql);
      if (failDropOf && sql === `DROP TABLE IF EXISTS ${failDropOf}`) throw new Error("SQLITE_BUSY");
    }
    prepare(sql) {
      return {
        all: () => {
          if (/FROM fabric_globals/.test(sql)) throw new Error("no such table: fabric_globals");
          return [];
        },
        // non-zero counts keep initDb's seeding out of the way (see db.shopProfile.test.js)
        get: () => (/COUNT\(\*\)/.test(sql) ? { c: 1 } : undefined),
        run: () => ({ changes: 0 }),
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
    close() {}
  },
}));

import { initDb, isDbOpen, getFabricGlobalsRaw, RETIRED_TABLES } from "./db.js";

const drops = () => execLog.filter((s) => s.startsWith("DROP TABLE"));

describe("initDb - retired tables", () => {
  beforeEach(() => {
    execLog = [];
    failDropOf = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("the four retired tables, and only those", () => {
    expect(RETIRED_TABLES).toEqual(["counters", "custom_clients", "custom_order_files", "fabric_globals"]);
  });

  it("drops each of them with IF EXISTS (a second start is a no-op)", () => {
    initDb();
    expect(drops()).toEqual(RETIRED_TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`));
  });

  it("no longer creates fabric_globals", () => {
    initDb();
    expect(execLog.some((s) => /CREATE TABLE IF NOT EXISTS fabric_globals/.test(s))).toBe(false);
  });

  it("one DROP that fails does not stop the others or the start", () => {
    failDropOf = "custom_clients";
    initDb();
    expect(drops()).toHaveLength(4);
    expect(isDbOpen()).toBe(true);
  });

  it("with the table gone, getFabricGlobalsRaw answers null - the v2 -> v3 step blocks", () => {
    initDb();
    expect(getFabricGlobalsRaw()).toBeNull();
  });

  it("the missing table is the normal state - no error line on every start", () => {
    initDb();
    console.error.mockClear();
    getFabricGlobalsRaw();
    expect(console.error).not.toHaveBeenCalled();
  });
});
