import { describe, it, expect, vi, beforeEach } from "vitest";

// The two shared tables of the Etsy import (E3b-2). The REAL db.js with a fake driver that keeps the
// tables as maps and enforces the UNIQUE of etsy_imports the way SQLite does (INSERT OR IGNORE).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let tablesBefore; // tables that exist before this start
let fabricNames; // rows of fabrics
let mapRows; // etsy_key -> { etsy_name, fabric_name }
let importRows; // "receipt:transaction" -> row
let createFails;
let sql;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
      if (createFails && /CREATE TABLE IF NOT EXISTS etsy_imports/.test(text)) throw new Error("disk I/O error");
    }
    prepare(text) {
      return {
        all: () => {
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_fabric_map/.test(text)) return [...mapRows].map(([etsy_key, r]) => ({ etsyKey: etsy_key, etsyName: r.etsy_name, fabricName: r.fabric_name }));
          return [];
        },
        get: (...args) => {
          if (/FROM sqlite_master/.test(text)) return tablesBefore.has("etsy_fabric_map") ? { 1: 1 } : undefined;
          if (/SELECT 1 FROM fabrics WHERE name = \?/.test(text)) return fabricNames.has(args[0]) ? { 1: 1 } : undefined;
          if (/FROM etsy_imports WHERE receipt_id/.test(text)) {
            const row = importRows.get(`${args[0]}:${args[1]}`);
            return row && { receiptId: row.receipt_id, transactionId: row.transaction_id, state: row.state, fileName: row.file_name, folder: row.folder, reason: row.reason };
          }
          if (/COUNT\(\*\)/.test(text)) return { c: 1 };
          return undefined;
        },
        run: (...args) => {
          if (/INSERT OR IGNORE INTO etsy_fabric_map/.test(text)) {
            if (mapRows.has(args[0])) return { changes: 0 };
            mapRows.set(args[0], { etsy_name: args[1], fabric_name: args[2] });
            return { changes: 1 };
          }
          if (/INSERT OR IGNORE INTO etsy_imports/.test(text)) {
            const key = `${args[0]}:${args[1]}`;
            if (importRows.has(key)) return { changes: 0 };
            importRows.set(key, { receipt_id: args[0], transaction_id: args[1], state: args[2], file_name: args[3], folder: args[4], reason: args[5] });
            return { changes: 1 };
          }
          if (/UPDATE etsy_imports SET state/.test(text)) {
            const row = importRows.get(`${args[4]}:${args[5]}`);
            if (row) Object.assign(row, { state: args[0], reason: args[1], file_name: args[2] ?? row.file_name });
            return { changes: row ? 1 : 0 };
          }
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

import { initDb, getEtsyFabricMap, getEtsyImport, claimEtsyImport, setEtsyImportState } from "./db.js";

const SEEDED = ["Calico Plain Cotton", "Eco Fleece"];

beforeEach(() => {
  tablesBefore = new Set();
  fabricNames = new Set(SEEDED);
  mapRows = new Map();
  importRows = new Map();
  createFails = false;
  sql = [];
});

describe("the seed of etsy_fabric_map (W7)", () => {
  it("is written by the start that creates the table, only for pairs whose Fabrics name exists", () => {
    initDb();
    const map = getEtsyFabricMap();
    expect(map.map((r) => r.fabricName).sort()).toEqual(["Calico Plain Cotton", "Eco Fleece"]);
    expect(map.find((r) => r.fabricName === "Eco Fleece")).toMatchObject({ etsyKey: "cuddlefleece", etsyName: "Cuddle Fleece" });
  });

  it("another shop's database (none of the names in fabrics) seeds nothing", () => {
    fabricNames = new Set(["Velvet"]);
    initDb();
    expect(getEtsyFabricMap()).toEqual([]);
  });

  it("a start that finds the table already there seeds nothing - a pair the shop deleted does not come back", () => {
    tablesBefore.add("etsy_fabric_map");
    initDb();
    expect(getEtsyFabricMap()).toEqual([]);
  });
});

describe("etsy_imports", () => {
  it("a claim is taken once: the second takes false (UNIQUE receipt + transaction)", () => {
    initDb();
    const line = { receiptId: "9", transactionId: "1", state: "pending", fileName: "a.jpg", folder: "Drill" };
    expect(claimEtsyImport(line)).toBe(true);
    expect(claimEtsyImport(line)).toBe(false);
    expect(claimEtsyImport({ ...line, transactionId: "2" })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "pending", fileName: "a.jpg", folder: "Drill" });
  });

  it("never seen is null, and a state moves with setEtsyImportState (the file name is kept)", () => {
    initDb();
    expect(getEtsyImport("9", "1")).toBeNull();
    claimEtsyImport({ receiptId: "9", transactionId: "1", state: "pending", fileName: "a.jpg", folder: "Drill" });
    expect(setEtsyImportState({ receiptId: 9, transactionId: 1, state: "done" })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "done", fileName: "a.jpg", reason: null });
  });

  it("with no database every call answers 'could not' - undefined / null / false, never a row", () => {
    // a module that was never started in this test file would keep an old handle, so ask an unstarted
    // state through a start that failed to create the tables
    createFails = true;
    initDb();
    expect(getEtsyImport("9", "1")).toBeUndefined();
    expect(claimEtsyImport({ receiptId: "9", transactionId: "1", state: "pending" })).toBeNull();
    expect(setEtsyImportState({ receiptId: "9", transactionId: "1", state: "done" })).toBe(false);
    expect(getEtsyFabricMap()).toBeNull();
  });

  it("a failed CREATE costs the Etsy import, not the database (initDb does not throw into the catch)", () => {
    createFails = true;
    initDb();
    // the rest of initDb ran: a later table of the same start was still created
    expect(sql.some((s) => /CREATE TABLE IF NOT EXISTS shop_profile/.test(s))).toBe(true);
  });
});
