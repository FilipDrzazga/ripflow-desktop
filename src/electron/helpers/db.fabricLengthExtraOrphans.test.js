import { describe, it, expect, vi, beforeEach } from "vitest";

// D72: an older build (no fabric_length_extra table) deletes or renames a material and leaves its
// allowance row behind, so a LATER material of that name inherited the allowance. The REAL db.js with a
// fake driver holding two tiny tables; the prune statement is executed here by its SQL shape.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let fabrics; // names in the fabrics table
let extras; // name -> percent
let pruneFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {}
    prepare(sql) {
      return {
        all: () => {
          if (/PRAGMA table_info\(fabrics\)/.test(sql)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM fabrics ORDER BY/.test(sql)) return fabrics.map((name) => ({ name, type: "Polyesters", xmlWidth: 1420, rollWidth: 1550 }));
          if (/SELECT name, percent FROM fabric_length_extra/.test(sql)) return [...extras].map(([name, percent]) => ({ name, percent }));
          return [];
        },
        get: (...args) => {
          if (/SELECT COUNT\(\*\) AS c FROM fabrics/.test(sql)) return { c: fabrics.length };
          if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
          if (/SELECT percent FROM fabric_length_extra WHERE name = \?/.test(sql)) {
            return extras.has(args[0]) ? { percent: extras.get(args[0]) } : undefined;
          }
          return undefined;
        },
        run: (...args) => {
          if (/DELETE FROM fabric_length_extra WHERE name NOT IN \(SELECT name FROM fabrics\)/.test(sql)) {
            if (pruneFails) throw new Error("database is locked");
            for (const name of [...extras.keys()]) if (!fabrics.includes(name)) extras.delete(name);
          }
          if (/INSERT OR REPLACE INTO fabric_length_extra/.test(sql)) extras.set(args[0], args[1]);
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

import { initDb, setFabricLengthExtra } from "./db.js";

describe("fabric_length_extra orphans (D72)", () => {
  beforeEach(() => {
    fabrics = ["Satin", "Chiffon"];
    extras = new Map([["Satin", 4], ["Gone", 9]]);
    pruneFails = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("start drops the allowance rows that have no material and keeps the others", () => {
    initDb();
    expect([...extras]).toEqual([["Satin", 4]]);
  });

  it("start prunes nothing while the catalogue is empty (an empty read must never wipe the allowances)", () => {
    fabrics = [];
    initDb();
    expect([...extras]).toEqual([["Satin", 4], ["Gone", 9]]);
  });

  it("a failed prune costs the cleanup only, never the start", () => {
    pruneFails = true;
    expect(() => initDb()).not.toThrow();
    expect(extras.get("Gone")).toBe(9);
  });

  it("an ADD that sends no allowance does not inherit an orphan row of that name", () => {
    initDb();
    extras.set("Voile", 7); // left behind after the start by an older build
    fabrics.push("Voile");
    expect(setFabricLengthExtra(undefined, "Voile", undefined)).toBe(true);
    expect(extras.has("Voile")).toBe(false);
  });

  it("an ADD that sends an allowance stores it, replacing the orphan", () => {
    initDb();
    extras.set("Voile", 7);
    expect(setFabricLengthExtra(undefined, "Voile", 2)).toBe(true);
    expect(extras.get("Voile")).toBe(2);
  });
});
