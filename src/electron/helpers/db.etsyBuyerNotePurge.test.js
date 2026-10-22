import { describe, it, expect, vi, beforeEach } from "vitest";

// D81: purgeOldEtsyBuyerNotes in the REAL db.js empties the note of finished lines past the retention. The fake driver
// proves the wiring (no column = could not, the states and the cutoff the statement is run with, a failed write = null,
// the count logged and never a note); SQLite's own date maths and the "row stays, other rows untouched" are proved on
// the real driver in agents/chat/artefakty/d81/sql-proof.cjs.
vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

const BASE_COLUMNS = ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at"];
const E4_COLUMNS = ["title", "quantity", "listing_id", "manual_xwd", "suggested_xwd", "ship_by"];

let columns;
let runs; // { sql, args } of every UPDATE
let changesToReport;
let updateFails;
let alterFails; // the ALTER of buyer_note fails with SQLITE_BUSY

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      const alter = text.match(/^ALTER TABLE etsy_imports ADD COLUMN (\w+) /);
      if (alter) {
        if (alterFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push(alter[1]);
      }
    }
    prepare(text) {
      return {
        all: () => (/PRAGMA table_info\(etsy_imports\)/.test(text) ? columns.map((name) => ({ name })) : /PRAGMA table_info\(fabrics\)/.test(text) ? ["name", "preferred_printer"].map((name) => ({ name })) : []),
        get: () => (/COUNT\(\*\)/.test(text) ? { c: 1 } : undefined),
        run: (...args) => {
          if (/^UPDATE etsy_imports SET buyer_note = NULL/.test(text)) {
            if (updateFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
            runs.push({ sql: text, args });
            return { changes: changesToReport };
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

import { initDb, purgeOldEtsyBuyerNotes } from "./db.js";
import { ETSY_BUYER_NOTE_RETENTION_DAYS } from "../../shared/etsyBuyerNote.js";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const DAY = 24 * 60 * 60;

beforeEach(() => {
  columns = [...BASE_COLUMNS, ...E4_COLUMNS, "buyer_note"];
  runs = [];
  changesToReport = 0;
  updateFails = false;
  alterFails = false;
  vi.restoreAllMocks();
});

describe("purgeOldEtsyBuyerNotes", () => {
  it("is 90 days", () => {
    expect(ETSY_BUYER_NOTE_RETENTION_DAYS).toBe(90);
  });

  it("answers null (could not) before the database is open", () => {
    expect(purgeOldEtsyBuyerNotes(NOW)).toBeNull();
  });

  it("answers null when the buyer_note column does not exist - a failed ALTER costs the notes and this", () => {
    columns = [...BASE_COLUMNS, ...E4_COLUMNS];
    alterFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    initDb();
    expect(purgeOldEtsyBuyerNotes(NOW)).toBeNull();
    expect(runs).toEqual([]);
  });

  it("empties only DONE and DISMISSED lines, older than the retention, and keeps the row (SET NULL)", () => {
    initDb();
    changesToReport = 3;
    expect(purgeOldEtsyBuyerNotes(NOW)).toBe(3);
    expect(runs).toHaveLength(1);
    const { sql, args } = runs[0];
    expect(sql).toMatch(/^UPDATE etsy_imports SET buyer_note = NULL WHERE buyer_note IS NOT NULL AND state IN \(\?, \?\)/);
    expect(sql).not.toMatch(/updated_at\s*=/);
    expect(sql).not.toMatch(/DELETE/i);
    expect(args.slice(0, 2)).toEqual(["done", "dismissed"]);
    expect(args[2]).toBe(Math.floor(NOW / 1000) - ETSY_BUYER_NOTE_RETENTION_DAYS * DAY);
  });

  it("logs how many were emptied and never a note; nothing logged for zero", () => {
    initDb();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    purgeOldEtsyBuyerNotes(NOW);
    expect(log).not.toHaveBeenCalled();
    changesToReport = 2;
    purgeOldEtsyBuyerNotes(NOW);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("[db] emptied 2 buyer note(s) past the 90-day retention");
  });

  it("a failed write answers null and never throws", () => {
    initDb();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    updateFails = true;
    expect(purgeOldEtsyBuyerNotes(NOW)).toBeNull();
  });
});
