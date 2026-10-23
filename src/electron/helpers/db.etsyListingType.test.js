import { describe, it, expect, vi, beforeEach } from "vitest";

// Plan FAB-3c: etsy_listing_type in the REAL db.js - its own table with its own flag (a failed CREATE costs the
// remembered types only, not the remembered fabrics), and the accessors. The fake driver keeps the table as a Map and
// reads the statement text; SQLite's own semantics (ON CONFLICT) are proved on the real driver in
// agents/chat/artefakty/fab-3c/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let types; // listing_id -> { print_type, updated_at }
let fabrics; // listing_id -> { fabric_name, updated_at }
let sql;
let typeCreateFails;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
      if (typeCreateFails && /CREATE TABLE IF NOT EXISTS etsy_listing_type/.test(text)) throw new Error("disk I/O error");
    }
    prepare(text) {
      return {
        all: () => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) {
            return ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at", "title", "quantity", "listing_id", "manual_xwd", "suggested_xwd", "suggested_file", "ship_by", "buyer_note"].map((name) => ({ name }));
          }
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_listing_type ORDER BY updated_at DESC/.test(text)) {
            return [...types.entries()]
              .sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at))
              .map(([listingId, row]) => ({ listingId, printType: row.print_type }));
          }
          if (/FROM etsy_listing_fabric ORDER BY updated_at DESC/.test(text)) {
            return [...fabrics.entries()].map(([listingId, row]) => ({ listingId, fabricName: row.fabric_name }));
          }
          return [];
        },
        get: () => (/COUNT\(\*\)/.test(text) ? { c: 1 } : undefined),
        run: (...args) => {
          if (/^INSERT INTO etsy_listing_type .* ON CONFLICT\(listing_id\) DO UPDATE SET/.test(text)) {
            types.set(args[0], { print_type: args[1], updated_at: args[2] });
            return { changes: 1 };
          }
          if (/^DELETE FROM etsy_listing_type WHERE listing_id = \?$/.test(text)) {
            return { changes: types.delete(args[0]) ? 1 : 0 };
          }
          if (/^INSERT INTO etsy_listing_fabric .* ON CONFLICT\(listing_id\) DO UPDATE SET/.test(text)) {
            fabrics.set(args[0], { fabric_name: args[1], updated_at: args[2] });
            return { changes: 1 };
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

import { initDb, getEtsyListingTypes, getEtsyListingType, setEtsyListingType, deleteEtsyListingType, getEtsyListingFabrics, setEtsyListingFabric } from "./db.js";

beforeEach(() => {
  types = new Map();
  fabrics = new Map();
  sql = [];
  typeCreateFails = false;
});

describe("the etsy_listing_type table", () => {
  it("is created at start, with the listing id as its key", () => {
    initDb();
    const create = sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_listing_type/.test(s));
    expect(create).toMatch(/listing_id\s+TEXT PRIMARY KEY/);
    expect(create).toMatch(/print_type\s+TEXT NOT NULL/);
  });
});

describe("remembering a print type for a listing", () => {
  it("writes it and reads it back, by listing and as a list", () => {
    initDb();
    expect(setEtsyListingType({ listingId: "1351273307", printType: "SNOOD" })).toBe(true);
    expect(getEtsyListingType("1351273307")).toBe("SNOOD");
    expect(getEtsyListingTypes()).toEqual([{ listingId: "1351273307", printType: "SNOOD" }]);
  });

  it("a second choice for the same listing replaces the first (one row per listing)", () => {
    initDb();
    setEtsyListingType({ listingId: "1", printType: "SNOOD" });
    setEtsyListingType({ listingId: "1", printType: "APRON" });
    expect(getEtsyListingTypes()).toHaveLength(1);
    expect(getEtsyListingType("1")).toBe("APRON");
  });

  it("a listing with nothing remembered, or a bad listing id, reads as null", () => {
    initDb();
    expect(getEtsyListingType("42")).toBeNull();
    expect(getEtsyListingType("abc")).toBeNull();
    expect(getEtsyListingType(undefined)).toBeNull();
  });

  it.each([
    ["a type outside the choices", { listingId: "1", printType: "TEA_TOWEL" }],
    ["a prototype key", { listingId: "1", printType: "constructor" }],
    ["the label instead of the code", { listingId: "1", printType: "Snood" }],
    ["no type", { listingId: "1", printType: undefined }],
    ["a listing that is not digits", { listingId: "12ab", printType: "SNOOD" }],
    ["a number as the listing", { listingId: 12, printType: "SNOOD" }],
  ])("refuses %s - null, nothing written", (_label, input) => {
    initDb();
    expect(setEtsyListingType(input)).toBeNull();
    expect(types.size).toBe(0);
  });

  it("a stored row with a code nobody can choose any more is not returned", () => {
    initDb();
    types.set("7", { print_type: "CUSHION", updated_at: "2026-10-23T08:00:00.000Z" });
    types.set("8", { print_type: "APRON", updated_at: "2026-10-23T08:01:00.000Z" });
    expect(getEtsyListingTypes()).toEqual([{ listingId: "8", printType: "APRON" }]);
    expect(getEtsyListingType("7")).toBeNull();
  });

  it("forgets a listing: deleted true once, false when there was none", () => {
    initDb();
    setEtsyListingType({ listingId: "1", printType: "SNOOD" });
    setEtsyListingType({ listingId: "2", printType: "APRON" });
    expect(deleteEtsyListingType("1")).toEqual({ deleted: true });
    expect(deleteEtsyListingType("1")).toEqual({ deleted: false });
    expect(getEtsyListingType("2")).toBe("APRON");
    expect(deleteEtsyListingType("x")).toBeNull();
  });
});

describe("a CREATE that failed costs the remembered types only", () => {
  it("every type accessor answers 'could not' (null) - and the remembered fabrics still work", () => {
    typeCreateFails = true;
    initDb();
    expect(getEtsyListingTypes()).toBeNull();
    expect(setEtsyListingType({ listingId: "1", printType: "SNOOD" })).toBeNull();
    expect(deleteEtsyListingType("1")).toBeNull();
    expect(getEtsyListingType("1")).toBeNull();
    expect(types.size).toBe(0);
    expect(setEtsyListingFabric({ listingId: "1", fabricName: "Drill" })).toBe(true);
    expect(getEtsyListingFabrics()).toEqual([{ listingId: "1", fabricName: "Drill" }]);
  });
});
