import { describe, it, expect, vi, beforeEach } from "vitest";

// listEtsyShipDates of the REAL db.js (plan ETA-2) on a small fake driver: it records the statement and the values, so
// this file pins the SHAPE (one grouped SELECT, one placeholder per distinct number, "dismissed" first) and the
// "could not ask" answers. What SQLite itself does with MIN / GROUP BY / the NULL filter is proved on the real driver in
// agents/chat/artefakty/eta-2/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let columns; // the columns etsy_imports has before this start
let alterFails; // the ship_by ALTER fails with SQLITE_BUSY
let shipDateSelects; // { text, values } of every grouped SELECT
let shipDateRows; // what that SELECT answers
let shipDateSelectFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      const alter = text.match(/^ALTER TABLE etsy_imports ADD COLUMN (\w+) /);
      if (alter) {
        if (alterFails && alter[1] === "ship_by") throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push(alter[1]);
      }
    }
    prepare(text) {
      return {
        all: (...values) => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) return columns.map((name) => ({ name }));
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/GROUP BY receipt_id/.test(text)) {
            shipDateSelects.push({ text, values });
            if (shipDateSelectFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
            return shipDateRows;
          }
          return [];
        },
        get: () => (/COUNT\(\*\)/.test(text) ? { c: 1 } : undefined),
        run: () => ({ changes: 1 }),
      };
    }
    transaction(fn) {
      return (...a) => fn(...a);
    }
    close() {}
  },
}));

import { initDb, listEtsyShipDates } from "./db.js";

beforeEach(() => {
  columns = ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at", "title", "quantity", "listing_id", "manual_xwd", "suggested_xwd"];
  alterFails = false;
  shipDateSelects = [];
  shipDateRows = [];
  shipDateSelectFails = false;
});

describe("listEtsyShipDates", () => {
  it("answers { receiptId: earliest date } from ONE grouped SELECT, dismissed first then one placeholder per number", () => {
    initDb();
    shipDateRows = [
      { receiptId: "123", shipBy: 1761523200, buyerNote: null },
      { receiptId: "456", shipBy: 1761696000, buyerNote: null },
    ];
    expect(listEtsyShipDates(["123", "456"])).toEqual({ 123: { shipBy: 1761523200, buyerNote: null }, 456: { shipBy: 1761696000, buyerNote: null } });
    expect(shipDateSelects).toHaveLength(1);
    const { text, values } = shipDateSelects[0];
    expect(text).toContain("MIN(ship_by) AS shipBy");
    // ANDed all the way: an OR here would let a dismissed line (or any line of any order) through
    expect(text).toContain("WHERE state != ? AND receipt_id IN (?, ?) GROUP BY receipt_id HAVING shipBy IS NOT NULL OR buyerNote IS NOT NULL");
    expect(text).toContain("GROUP BY receipt_id");
    expect(values).toEqual(["dismissed", "123", "456"]);
  });

  it("asks each number once, as text", () => {
    initDb();
    listEtsyShipDates(["123", 123, "123", "456"]);
    expect(shipDateSelects[0].values).toEqual(["dismissed", "123", "456"]);
  });

  it("an order the table has no date for is simply not a key", () => {
    initDb();
    shipDateRows = [];
    expect(listEtsyShipDates(["123"])).toEqual({});
  });

  it("an empty list is an empty answer and runs no statement", () => {
    initDb();
    expect(listEtsyShipDates([])).toEqual({});
    expect(shipDateSelects).toHaveLength(0);
  });

  it("a request that is not a list could not be asked (null)", () => {
    initDb();
    expect(listEtsyShipDates("123")).toBeNull();
    expect(listEtsyShipDates(undefined)).toBeNull();
    expect(shipDateSelects).toHaveLength(0);
  });

  it("without the ship_by column (the ALTER failed) it could not ask - null, never an empty answer", () => {
    alterFails = true;
    initDb();
    expect(listEtsyShipDates(["123"])).toBeNull();
    expect(shipDateSelects).toHaveLength(0);
  });

  it("a failed SELECT could not ask (null)", () => {
    initDb();
    shipDateSelectFails = true;
    expect(listEtsyShipDates(["123"])).toBeNull();
  });
});
