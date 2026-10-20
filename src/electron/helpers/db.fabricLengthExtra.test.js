import { describe, it, expect, vi, beforeEach } from "vitest";

// The length allowance of a fabric lives in its own table (fabric_length_extra), so an older build
// that rewrites fabrics rows cannot clear it. The REAL db.js with a fake driver holding two tiny tables.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let execLog;
let fabrics; // names in the fabrics table
let extras; // name -> percent
let extrasReadFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(sql) {
      execLog.push(sql);
    }
    prepare(sql) {
      return {
        all: () => {
          if (/PRAGMA table_info\(fabrics\)/.test(sql)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM fabrics ORDER BY/.test(sql)) return fabrics.map((name) => ({ name, type: "Polyesters", xmlWidth: 1420, rollWidth: 1550 }));
          if (/SELECT name, percent FROM fabric_length_extra/.test(sql)) {
            if (extrasReadFails) throw new Error("no such table: fabric_length_extra");
            return [...extras].map(([name, percent]) => ({ name, percent }));
          }
          return [];
        },
        get: (...args) => {
          if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
          if (/SELECT percent FROM fabric_length_extra WHERE name = \?/.test(sql)) {
            return extras.has(args[0]) ? { percent: extras.get(args[0]) } : undefined;
          }
          return undefined;
        },
        run: (...args) => {
          if (/INSERT OR REPLACE INTO fabric_length_extra/.test(sql)) extras.set(args[0], args[1]);
          if (sql === "DELETE FROM fabric_length_extra") extras.clear();
          if (sql === "DELETE FROM fabric_length_extra WHERE name = ?") extras.delete(args[0]);
          return { changes: 1 };
        },
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
    close() {}
  },
}));

import { initDb, getAllFabrics, setFabricLengthExtra, deleteFabricLengthExtra, setAllFabricLengthExtras } from "./db.js";

const allowance = (name) => getAllFabrics().find((f) => f.name === name).lengthExtraPercent;

describe("fabric_length_extra", () => {
  beforeEach(() => {
    execLog = [];
    fabrics = ["Satin", "Chiffon"];
    extras = new Map([["Satin", 4]]);
    extrasReadFails = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    initDb();
  });

  it("the table is created at start", () => {
    expect(execLog.some((s) => /CREATE TABLE IF NOT EXISTS fabric_length_extra/.test(s))).toBe(true);
  });

  it("every fabric carries its allowance, 0 when it has none", () => {
    expect(allowance("Satin")).toBe(4);
    expect(allowance("Chiffon")).toBe(0);
  });

  it("an unreadable allowance table costs the allowances, never the catalogue", () => {
    extrasReadFails = true;
    expect(getAllFabrics().map((f) => [f.name, f.lengthExtraPercent])).toEqual([["Satin", 0], ["Chiffon", 0]]);
  });

  it("a save sets, changes and clears it (0 removes the row)", () => {
    expect(setFabricLengthExtra("Chiffon", "Chiffon", 2.5)).toBe(true);
    expect(extras.get("Chiffon")).toBe(2.5);
    expect(setFabricLengthExtra("Chiffon", "Chiffon", 3)).toBe(true);
    expect(extras.get("Chiffon")).toBe(3);
    expect(setFabricLengthExtra("Chiffon", "Chiffon", 0)).toBe(true);
    expect(extras.has("Chiffon")).toBe(false);
  });

  it("a save that does not send it keeps it, also across a rename", () => {
    expect(setFabricLengthExtra("Satin", "Satin", undefined)).toBe(true);
    expect(extras.get("Satin")).toBe(4);
    expect(setFabricLengthExtra("Satin", "Satin Flow", undefined)).toBe(true);
    expect([...extras]).toEqual([["Satin Flow", 4]]);
  });

  it("a rename that sets a new value moves the row", () => {
    expect(setFabricLengthExtra("Satin", "Satin Flow", 6)).toBe(true);
    expect([...extras]).toEqual([["Satin Flow", 6]]);
  });

  it("deleting a fabric drops its allowance", () => {
    expect(deleteFabricLengthExtra("Satin")).toBe(true);
    expect(extras.size).toBe(0);
  });

  it("setAll: a row that sends one sets it, one that does not keeps it, a name that left loses it", () => {
    extras = new Map([["Satin", 4], ["Gone", 9]]);
    const list = [{ name: "Satin" }, { name: "Chiffon", lengthExtraPercent: 7 }, { name: "Voile", lengthExtraPercent: 0 }];
    expect(setAllFabricLengthExtras(list)).toBe(true);
    expect([...extras]).toEqual([["Satin", 4], ["Chiffon", 7]]);
  });

  it("setAll writes nothing when the table cannot be read", () => {
    extrasReadFails = true;
    expect(setAllFabricLengthExtras([{ name: "Satin", lengthExtraPercent: 1 }])).toBe(false);
    expect(extras.get("Satin")).toBe(4);
  });
});
