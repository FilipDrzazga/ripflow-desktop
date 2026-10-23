import { describe, it, expect, vi, beforeEach } from "vitest";

// Plan FAB: etsy_listing_fabric in the REAL db.js - its own table with its own flag (a failed CREATE costs the
// remembered choices only), no column added to etsy_imports, and the three accessors. The fake driver keeps the table
// as a Map and reads the statement text, so a wrong table name, a dropped WHERE or a missing upsert fails here;
// SQLite's own semantics (ON CONFLICT) are proved on the real driver in agents/chat/artefakty/fab-1/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let table; // listing_id -> { fabric_name, updated_at }
let sql;
let createFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
      if (createFails && /CREATE TABLE IF NOT EXISTS etsy_listing_fabric/.test(text)) throw new Error("disk I/O error");
    }
    prepare(text) {
      return {
        all: () => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) {
            return ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at", "title", "quantity", "listing_id", "manual_xwd", "suggested_xwd", "suggested_file", "ship_by", "buyer_note"].map((name) => ({ name }));
          }
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_listing_fabric ORDER BY updated_at DESC/.test(text)) {
            return [...table.entries()]
              .sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at))
              .map(([listingId, row]) => ({ listingId, fabricName: row.fabric_name }));
          }
          return [];
        },
        get: () => (/COUNT\(\*\)/.test(text) ? { c: 1 } : undefined),
        run: (...args) => {
          if (/^INSERT INTO etsy_listing_fabric .* ON CONFLICT\(listing_id\) DO UPDATE SET/.test(text)) {
            table.set(args[0], { fabric_name: args[1], updated_at: args[2] });
            return { changes: 1 };
          }
          if (/^DELETE FROM etsy_listing_fabric WHERE listing_id = \?$/.test(text)) {
            return { changes: table.delete(args[0]) ? 1 : 0 };
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

import { initDb, getEtsyListingFabrics, getEtsyListingFabric, setEtsyListingFabric, deleteEtsyListingFabric } from "./db.js";

beforeEach(() => {
  table = new Map();
  sql = [];
  createFails = false;
});

describe("the etsy_listing_fabric table", () => {
  it("is created at start, with the listing id as its key, and etsy_imports gets no new column for it", () => {
    initDb();
    const create = sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_listing_fabric/.test(s));
    expect(create).toMatch(/listing_id\s+TEXT PRIMARY KEY/);
    expect(create).toMatch(/fabric_name TEXT NOT NULL/);
    expect(sql.some((s) => /ALTER TABLE etsy_imports ADD COLUMN \w*fabric/i.test(s))).toBe(false);
  });
});

describe("remembering a fabric for a listing", () => {
  it("writes it and reads it back, by listing and as a list", () => {
    initDb();
    expect(setEtsyListingFabric({ listingId: "1351273307", fabricName: "Active Eco Lycra" })).toBe(true);
    expect(getEtsyListingFabric("1351273307")).toBe("Active Eco Lycra");
    expect(getEtsyListingFabrics()).toEqual([{ listingId: "1351273307", fabricName: "Active Eco Lycra" }]);
  });

  it("a second choice for the same listing replaces the first (one row per listing)", () => {
    initDb();
    setEtsyListingFabric({ listingId: "1351273307", fabricName: "Active Eco Lycra" });
    setEtsyListingFabric({ listingId: "1351273307", fabricName: "Drill" });
    expect(getEtsyListingFabrics()).toHaveLength(1);
    expect(getEtsyListingFabric("1351273307")).toBe("Drill");
  });

  it("a listing with nothing remembered, or a bad listing id, reads as null", () => {
    initDb();
    expect(getEtsyListingFabric("42")).toBeNull();
    expect(getEtsyListingFabric("abc")).toBeNull();
    expect(getEtsyListingFabric(undefined)).toBeNull();
  });

  it.each([
    ["a listing that is not digits", { listingId: "12ab", fabricName: "Drill" }],
    ["no listing", { listingId: "", fabricName: "Drill" }],
    ["a number as the listing", { listingId: 1351273307, fabricName: "Drill" }],
    ["an empty fabric", { listingId: "1", fabricName: "" }],
    ["no fabric", { listingId: "1", fabricName: undefined }],
    ["a very long fabric", { listingId: "1", fabricName: "D".repeat(201) }],
  ])("refuses %s - null, nothing written", (_label, input) => {
    initDb();
    expect(setEtsyListingFabric(input)).toBeNull();
    expect(table.size).toBe(0);
  });

  it("forgets a listing: deleted true once, false when there was none", () => {
    initDb();
    setEtsyListingFabric({ listingId: "1", fabricName: "Drill" });
    setEtsyListingFabric({ listingId: "2", fabricName: "Drill" });
    expect(deleteEtsyListingFabric("1")).toEqual({ deleted: true });
    expect(deleteEtsyListingFabric("1")).toEqual({ deleted: false });
    expect(getEtsyListingFabric("2")).toBe("Drill");
    expect(deleteEtsyListingFabric("x")).toBeNull();
  });
});

describe("a CREATE that failed costs the remembered choices only", () => {
  it("every accessor answers 'could not' (null), never an empty list or a write - and the rest of the Etsy tables still work", () => {
    createFails = true;
    initDb();
    expect(getEtsyListingFabrics()).toBeNull();
    expect(setEtsyListingFabric({ listingId: "1", fabricName: "Drill" })).toBeNull();
    expect(deleteEtsyListingFabric("1")).toBeNull();
    expect(getEtsyListingFabric("1")).toBeNull();
    expect(table.size).toBe(0);
  });
});
