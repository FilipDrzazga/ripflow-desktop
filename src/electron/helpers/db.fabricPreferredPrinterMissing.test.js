import { describe, it, expect, vi, beforeEach } from "vitest";

// D8: the start's ALTER that adds fabrics.preferred_printer can fail (SQLITE_BUSY past
// busy_timeout on the first start of a new build). The catalogue must still be read - every row
// with preferredPrinter null - a write without a preference must still go through, and only a write
// that sets one is refused; the next one retries the ALTER. The REAL db.js with a fake driver whose
// SQL fails the way SQLite does on a missing column (the edge of db.fabricPreferredPrinter.test.js).
// That real SQLite takes the statements is the live check (agents/chat/artefakty/dlug-5/live-d8.mjs).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let execLog;
let openFails; // the share is unreachable: the constructor throws, initDb leaves no handle
let alterFails; // the share is locked: the ALTER throws SQLITE_BUSY
let columns; // PRAGMA table_info(fabrics)
let rows; // name -> { xml_width, preferred_printer }

const noColumn = () => {
  throw new Error("no such column: preferred_printer");
};
const hasColumn = () => columns.includes("preferred_printer");

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    constructor() {
      if (openFails) throw new Error("unable to open database file");
    }
    pragma() {
      return [];
    }
    exec(sql) {
      execLog.push(sql);
      if (/ADD COLUMN preferred_printer/.test(sql)) {
        if (alterFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push("preferred_printer");
      }
    }
    prepare(sql) {
      const usesColumn = /preferred_printer/.test(sql) && !/PRAGMA/.test(sql);
      if (usesColumn && !hasColumn()) noColumn();
      return {
        all: () => {
          if (/PRAGMA table_info\(fabrics\)/.test(sql)) return columns.map((name) => ({ name }));
          if (/FROM fabrics ORDER BY/.test(sql)) {
            return [...rows].map(([name, r]) => ({ name, type: "Polyesters", xmlWidth: r.xml_width, preferredPrinter: /NULL AS preferredPrinter/.test(sql) ? null : r.preferred_printer }));
          }
          if (/SELECT name, preferred_printer AS p FROM fabrics/.test(sql)) return [...rows].map(([name, r]) => ({ name, p: r.preferred_printer }));
          return [];
        },
        get: (...args) => {
          if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
          if (/SELECT preferred_printer AS p FROM fabrics WHERE name = \?/.test(sql)) {
            const r = rows.get(args[0]);
            return r ? { p: r.preferred_printer } : undefined;
          }
          return undefined;
        },
        run: (...args) => {
          if (/INSERT (OR REPLACE )?INTO fabrics/.test(sql)) {
            rows.set(args[0], { xml_width: args[2], ...(usesColumn ? { preferred_printer: args[8] } : { preferred_printer: rows.get(args[0])?.preferred_printer ?? null }) });
          }
          if (sql === "DELETE FROM fabrics") rows.clear();
          if (sql === "DELETE FROM fabrics WHERE name = ?") rows.delete(args[0]);
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

import { initDb, getAllFabrics, saveFabric, setAllFabrics, ensureFabricPreferredPrinter } from "./db.js";

const fabric = (name, extra = {}) => ({ name, type: "Polyesters", xmlWidth: 1420, rollWidth: 1550, ...extra });
const alters = () => execLog.filter((s) => /ADD COLUMN preferred_printer/.test(s)).length;

describe("fabrics without the preferred_printer column (D8)", () => {
  beforeEach(() => {
    execLog = [];
    openFails = false;
    alterFails = true;
    columns = ["name", "type", "xml_width", "roll_width", "is_velvet", "is_linen", "is_blossom", "alias"];
    rows = new Map([
      ["Eco Satin Flow", { xml_width: 1420, preferred_printer: null }],
      ["Chiffon", { xml_width: 1400, preferred_printer: null }],
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    initDb();
  });

  it("the start's ALTER failed and the column is missing (harness guard: the rest needs this state)", () => {
    expect(alters()).toBe(1);
    expect(hasColumn()).toBe(false);
  });

  it("the catalogue is still read, every row with preferredPrinter null", () => {
    const list = getAllFabrics();
    expect(list.map((f) => f.name)).toEqual(["Eco Satin Flow", "Chiffon"]);
    expect(list.every((f) => f.preferredPrinter === null)).toBe(true);
  });

  it("a save without a preference goes through without the column (not sent, None, empty)", () => {
    expect(saveFabric("Eco Satin Flow", fabric("Eco Satin Flow", { xmlWidth: 1600 }))).toBe(true);
    expect(saveFabric("Chiffon", fabric("Chiffon", { xmlWidth: 1500, preferredPrinter: null }))).toBe(true);
    expect(saveFabric(null, fabric("Organza", { preferredPrinter: "" }))).toBe(true);
    expect(rows.get("Eco Satin Flow").xml_width).toBe(1600);
    expect(rows.get("Chiffon").xml_width).toBe(1500);
    expect(rows.has("Organza")).toBe(true);
  });

  it("a save that sets a preference is refused and writes nothing", () => {
    expect(saveFabric("Eco Satin Flow", fabric("Eco Satin Flow", { xmlWidth: 1600, preferredPrinter: "YOKO" }))).toBe(false);
    expect(rows.get("Eco Satin Flow").xml_width).toBe(1420);
  });

  it("setAll without a preference goes through; with one it is refused and the catalogue stays", () => {
    expect(setAllFabrics([fabric("Eco Satin Flow"), fabric("Organza", { preferredPrinter: null })])).toBe(true);
    expect([...rows.keys()]).toEqual(["Eco Satin Flow", "Organza"]);
    expect(setAllFabrics([fabric("Voile"), fabric("Organza", { preferredPrinter: "YUMI" })])).toBe(false);
    expect([...rows.keys()]).toEqual(["Eco Satin Flow", "Organza"]);
  });

  it("ensureFabricPreferredPrinter retries the ALTER: false while the lock holds, true once it is gone", () => {
    expect(ensureFabricPreferredPrinter()).toBe(false);
    expect(alters()).toBe(2);
    alterFails = false;
    expect(ensureFabricPreferredPrinter()).toBe(true);
    expect(hasColumn()).toBe(true);
    expect(saveFabric("Eco Satin Flow", fabric("Eco Satin Flow", { preferredPrinter: "YOKO" }))).toBe(true);
    expect(getAllFabrics().find((f) => f.name === "Eco Satin Flow").preferredPrinter).toBe("YOKO");
  });

  it("a column another station's start added is used at once, without a retry", () => {
    columns.push("preferred_printer");
    rows.get("Chiffon").preferred_printer = "YUMI";
    expect(getAllFabrics().find((f) => f.name === "Chiffon").preferredPrinter).toBe("YUMI");
    expect(saveFabric("Chiffon", fabric("Chiffon"))).toBe(true);
    expect(rows.get("Chiffon").preferred_printer).toBe("YUMI");
    expect(alters()).toBe(1);
  });

  it("every open asks its own file: an earlier start that had the column does not carry over", () => {
    alterFails = false;
    initDb();
    expect(hasColumn()).toBe(true);
    // initDb again (Reload, 4-retry - it reads storagePath anew) onto a file without the column
    columns = columns.filter((c) => c !== "preferred_printer");
    alterFails = true;
    initDb();
    expect(getAllFabrics()?.map((f) => f.name)).toEqual(["Eco Satin Flow", "Chiffon"]);
  });

  it("no database at all: ensureFabricPreferredPrinter answers true - the write fails by itself, not for a column", () => {
    openFails = true;
    initDb();
    expect(ensureFabricPreferredPrinter()).toBe(true);
    expect(saveFabric(null, fabric("Organza", { preferredPrinter: "YOKO" }))).toBe(false);
  });
});
