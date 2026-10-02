import { describe, it, expect, vi, beforeEach } from "vitest";

// The preferred printer of a fabric (fabrics.preferred_printer): the column is added at start
// like alias, and a save or an import that does not SEND the field keeps what the row has. The
// REAL db.js with a fake driver holding a tiny fabrics table (the same edge as
// db.dropRetired.test.js). That SQLite accepts the statements on a real file is the live check
// (agents/chat/artefakty/preferred-printer, a sandbox copy of the DB).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let execLog;
let columns; // PRAGMA table_info(fabrics)
let rows; // name -> { preferred_printer }
let inserts; // the arguments of every fabrics INSERT

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
          if (/PRAGMA table_info\(fabrics\)/.test(sql)) return columns.map((name) => ({ name }));
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
            inserts.push({ sql, args });
            rows.set(args[0], { preferred_printer: args[8] });
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

import { initDb, saveFabric, setAllFabrics } from "./db.js";

const fabric = (name, extra = {}) => ({ name, type: "Polyesters", xmlWidth: 1420, rollWidth: 1550, ...extra });

describe("fabrics.preferred_printer", () => {
  beforeEach(() => {
    execLog = [];
    columns = ["name", "type", "xml_width", "roll_width", "is_velvet", "is_linen", "is_blossom", "alias"];
    rows = new Map();
    inserts = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("an existing DB without the column gets it at start", () => {
    initDb();
    expect(execLog).toContain("ALTER TABLE fabrics ADD COLUMN preferred_printer TEXT");
  });

  it("a DB that has it is left alone (a second start is a no-op)", () => {
    columns.push("preferred_printer");
    initDb();
    expect(execLog.some((s) => /ADD COLUMN preferred_printer/.test(s))).toBe(false);
  });

  it("save stores the preferred printer the caller sends", () => {
    initDb();
    expect(saveFabric(null, fabric("Eco Satin Flow", { preferredPrinter: "YOKO" }))).toBe(true);
    expect(inserts.at(-1).sql).toMatch(/preferred_printer\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)/);
    expect(rows.get("Eco Satin Flow").preferred_printer).toBe("YOKO");
  });

  it("save WITHOUT the field keeps the preference; null clears it", () => {
    initDb();
    rows.set("Eco Satin Flow", { preferred_printer: "YOKO" });
    saveFabric("Eco Satin Flow", fabric("Eco Satin Flow"));
    expect(rows.get("Eco Satin Flow").preferred_printer).toBe("YOKO");
    saveFabric("Eco Satin Flow", fabric("Eco Satin Flow", { preferredPrinter: null }));
    expect(rows.get("Eco Satin Flow").preferred_printer).toBeNull();
  });

  it("a rename carries the preference to the new name", () => {
    initDb();
    rows.set("Eco Satin", { preferred_printer: "YUMI" });
    saveFabric("Eco Satin", fabric("Eco Satin Flow"));
    expect(rows.has("Eco Satin")).toBe(false);
    expect(rows.get("Eco Satin Flow").preferred_printer).toBe("YUMI");
  });

  it("setAll keeps, by name, the preference of rows that do not send it", () => {
    initDb();
    rows.set("Eco Satin Flow", { preferred_printer: "YOKO" });
    rows.set("Chiffon", { preferred_printer: "YUMI" });
    setAllFabrics([fabric("Eco Satin Flow"), fabric("Chiffon", { preferredPrinter: "" }), fabric("Organza", { preferredPrinter: "YOKO" })]);
    expect(rows.get("Eco Satin Flow").preferred_printer).toBe("YOKO");
    expect(rows.get("Chiffon").preferred_printer).toBeNull();
    expect(rows.get("Organza").preferred_printer).toBe("YOKO");
  });
});
