import { describe, it, expect, vi, beforeEach } from "vitest";

// MSG-2: listEtsyShipDates of the REAL db.js also carries the buyer's note. A fake driver that records the statement;
// what SQLite does with MIN / MAX / HAVING is proved on the real driver in agents/chat/artefakty/msg-2/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let columns;
let failingAlter; // the column whose ALTER fails with SQLITE_BUSY
let selects;
let rows;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      const alter = text.match(/^ALTER TABLE etsy_imports ADD COLUMN (\w+) /);
      if (alter) {
        if (alter[1] === failingAlter) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push(alter[1]);
      }
    }
    prepare(text) {
      return {
        all: (...values) => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) return columns.map((name) => ({ name }));
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/GROUP BY receipt_id/.test(text)) {
            selects.push({ text, values });
            return rows;
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
  failingAlter = null;
  selects = [];
  rows = [];
});

describe("listEtsyShipDates, the buyer's note half (MSG-2)", () => {
  it("asks for the note in the SAME statement as the date, and keeps an order that has only a note", () => {
    initDb();
    rows = [
      { receiptId: "1", shipBy: 1761523200, buyerNote: "Gift - please wrap" },
      { receiptId: "2", shipBy: null, buyerNote: "Call me" },
      { receiptId: "3", shipBy: 1761696000, buyerNote: null },
    ];
    expect(listEtsyShipDates(["1", "2", "3"])).toEqual({
      1: { shipBy: 1761523200, buyerNote: "Gift - please wrap" },
      2: { shipBy: null, buyerNote: "Call me" },
      3: { shipBy: 1761696000, buyerNote: null },
    });
    expect(selects).toHaveLength(1);
    expect(selects[0].text).toContain("MAX(buyer_note) AS buyerNote");
    expect(selects[0].text).toContain("MIN(ship_by) AS shipBy");
    expect(selects[0].text).not.toContain("ship_by IS NOT NULL AND");
  });

  it("without the buyer_note column (its ALTER failed) it still answers the dates, the note half is NULL", () => {
    failingAlter = "buyer_note";
    initDb();
    rows = [{ receiptId: "1", shipBy: 1761523200, buyerNote: null }];
    expect(listEtsyShipDates(["1"])).toEqual({ 1: { shipBy: 1761523200, buyerNote: null } });
    expect(selects[0].text).toContain("NULL AS buyerNote");
    expect(selects[0].text).not.toContain("MAX(buyer_note)");
  });

  it("an undefined column value of a row reads as null, never as a missing key", () => {
    initDb();
    rows = [{ receiptId: "1", shipBy: 1761523200 }];
    expect(listEtsyShipDates(["1"])).toEqual({ 1: { shipBy: 1761523200, buyerNote: null } });
  });
});
