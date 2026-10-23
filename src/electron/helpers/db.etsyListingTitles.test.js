import { describe, it, expect, vi } from "vitest";

// Settings > Etsy > Remembered choices: the titles read of the REAL db.js. The fake driver answers every SELECT with no
// rows, so this file pins the guards of the function; the SQL itself is proved on the real driver in
// agents/chat/artefakty/fab-4/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let sql = [];

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
    }
    prepare(text) {
      return {
        all: () => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) {
            return ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at", "title", "quantity", "listing_id", "manual_xwd", "suggested_xwd", "suggested_file", "ship_by", "buyer_note"].map((name) => ({ name }));
          }
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
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

import { initDb, getEtsyListingTitles } from "./db.js";

describe("getEtsyListingTitles", () => {
  it("guards its input (digits only, a list, at most 500) and only reads - the SQL itself is proved in agents/chat/artefakty/fab-4/sql-proof.cjs", () => {
    initDb();
    expect(getEtsyListingTitles([])).toEqual({});
    expect(getEtsyListingTitles(["abc", 5, null])).toEqual({});
    expect(getEtsyListingTitles("1")).toBeNull();
    const many = Array.from({ length: 600 }, (_, i) => String(i + 1));
    const before = sql.length;
    expect(getEtsyListingTitles([...many, "1", "2"])).toEqual({});
    expect(sql.length).toBe(before); // a read, not an exec
  });
});
