import { describe, it, expect, vi, beforeEach } from "vitest";

// Plan IMP-W: etsy_importers in the REAL db.js - the heartbeat of the stations switched on as the Etsy importer, a table
// of its own with its own flag (a failed CREATE costs the warning only). The fake driver keeps the table as a Map and
// reads the statement text; ON CONFLICT is proved on the real driver in agents/chat/artefakty/imp-w/sql-proof.cjs.

vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" } }));
vi.mock("./getRootPath.js", () => ({ getStorageRootPath: () => "C:/tmp/ripflow-test" }));

let beats; // workstation -> { interval_min, last_tick_at }
let sql;
let createFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
      if (createFails && /CREATE TABLE IF NOT EXISTS etsy_importers/.test(text)) throw new Error("disk I/O error");
    }
    prepare(text) {
      return {
        all: () => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) {
            return ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at", "title", "quantity", "listing_id", "manual_xwd", "suggested_xwd", "suggested_file", "ship_by", "buyer_note"].map((name) => ({ name }));
          }
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_importers$/.test(text)) {
            return [...beats.entries()].map(([workstation, r]) => ({ workstation, intervalMin: r.interval_min, lastTickAt: r.last_tick_at }));
          }
          return [];
        },
        get: () => (/COUNT\(\*\)/.test(text) ? { c: 1 } : undefined),
        run: (...args) => {
          if (/^INSERT INTO etsy_importers .* ON CONFLICT\(workstation\) DO UPDATE SET/.test(text)) {
            beats.set(args[0], { interval_min: args[1], last_tick_at: args[2] });
            return { changes: 1 };
          }
          if (/^DELETE FROM etsy_importers WHERE workstation = \?$/.test(text)) return { changes: beats.delete(args[0]) ? 1 : 0 };
          return { changes: 1 };
        },
      };
    }
    transaction(fn) {
      return (...a) => fn(...a);
    }
    close() {}
  },
}));

import { initDb, touchEtsyImporter, removeEtsyImporter, listEtsyImporters, getEtsyListingFabrics } from "./db.js";

beforeEach(() => {
  beats = new Map();
  sql = [];
  createFails = false;
});

describe("the etsy_importers table", () => {
  it("is created at start with the station name as its key", () => {
    initDb();
    const create = sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_importers/.test(s));
    expect(create).toMatch(/workstation\s+TEXT PRIMARY KEY/);
    expect(create).toMatch(/interval_min INTEGER NOT NULL/);
    expect(create).toMatch(/last_tick_at TEXT NOT NULL/);
  });
});

describe("the heartbeat", () => {
  it("is written and read back with the time of the write", () => {
    initDb();
    expect(touchEtsyImporter({ workstation: "Cotton PC", intervalMin: 2 })).toBe(true);
    const [row] = listEtsyImporters();
    expect(row).toMatchObject({ workstation: "Cotton PC", intervalMin: 2 });
    expect(Math.abs(Date.parse(row.lastTickAt) - Date.now())).toBeLessThan(5000);
  });

  it("a second beat of the same station replaces the first (one row per station)", () => {
    initDb();
    touchEtsyImporter({ workstation: "Cotton PC", intervalMin: 2 });
    touchEtsyImporter({ workstation: " Cotton PC ", intervalMin: 5 });
    expect(listEtsyImporters()).toHaveLength(1);
    expect(listEtsyImporters()[0].intervalMin).toBe(5);
  });

  it.each([
    ["no name", { workstation: "", intervalMin: 2 }],
    ["a name that is not text", { workstation: 5, intervalMin: 2 }],
    ["a very long name", { workstation: "P".repeat(101), intervalMin: 2 }],
    ["an interval of 0", { workstation: "A", intervalMin: 0 }],
    ["an interval over a day", { workstation: "A", intervalMin: 1441 }],
    ["a fractional interval", { workstation: "A", intervalMin: 2.5 }],
    ["an interval that is text", { workstation: "A", intervalMin: "2" }],
  ])("refuses %s - null, nothing written", (_label, input) => {
    initDb();
    expect(touchEtsyImporter(input)).toBeNull();
    expect(beats.size).toBe(0);
  });

  it("removing a station: deleted true once, false when there was no row, null for a bad name", () => {
    initDb();
    touchEtsyImporter({ workstation: "A", intervalMin: 2 });
    touchEtsyImporter({ workstation: "B", intervalMin: 2 });
    expect(removeEtsyImporter("A")).toEqual({ deleted: true });
    expect(removeEtsyImporter("A")).toEqual({ deleted: false });
    expect(listEtsyImporters().map((r) => r.workstation)).toEqual(["B"]);
    expect(removeEtsyImporter("")).toBeNull();
    expect(removeEtsyImporter(undefined)).toBeNull();
  });
});

describe("a CREATE that failed costs the warning only", () => {
  it("every accessor answers 'could not' (null), never an empty list - and the other Etsy tables still work", () => {
    createFails = true;
    initDb();
    expect(listEtsyImporters()).toBeNull();
    expect(touchEtsyImporter({ workstation: "A", intervalMin: 2 })).toBeNull();
    expect(removeEtsyImporter("A")).toBeNull();
    expect(beats.size).toBe(0);
    expect(getEtsyListingFabrics()).toEqual([]);
  });
});
