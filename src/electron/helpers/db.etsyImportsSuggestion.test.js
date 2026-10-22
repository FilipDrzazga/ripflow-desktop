import { describe, it, expect, vi, beforeEach } from "vitest";

// The E4c column of etsy_imports in the REAL db.js: suggested_xwd (CREATE + ALTER at start, a failed ALTER = no
// suggestions and nothing else lost), written at the claim and by the guarded move, read by the bar's list. Same
// fake driver as db.etsyImportsReview.test.js. The fake driver reads column lists and WHERE guards out of the SQL text itself, so a
// statement that names a wrong column or drops its guard fails here; SQLite's own semantics are proved on the
// real driver in agents/chat/artefakty/etsy-e4a/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

const BASE_COLUMNS = ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at"];
const E4_COLUMNS = ["title", "quantity", "listing_id", "manual_xwd"];

let columns; // the columns etsy_imports has before this start
let alterFailsOn; // the column whose ALTER fails with SQLITE_BUSY
let rows; // "receipt:transaction" -> { column: value }
let sql;

const key = (r, t) => `${r}:${t}`;

// "a AS b, c" -> [["a", "b"], ["c", "c"]]
const selectList = (text) =>
  text
    .match(/^SELECT (.+) FROM etsy_imports/)[1]
    .split(", ")
    .map((part) => {
      const [col, alias] = part.split(" AS ");
      return [col.trim(), (alias ?? col).trim()];
    });

const project = (text, row) => Object.fromEntries(selectList(text).map(([col, alias]) => [alias, row[col] ?? null]));

const runUpdate = (text, args) => {
  const [, setPart, wherePart] = text.match(/^UPDATE etsy_imports SET (.+) WHERE (.+)$/);
  const sets = [...setPart.matchAll(/(\w+) = (COALESCE\(\?, \w+\)|\?)/g)].map((m) => ({ col: m[1], keep: m[2] !== "?" }));
  for (const { col } of sets) if (col !== "NULL" && !columns.includes(col)) throw new Error(`no such column: ${col}`);
  const values = args.slice(0, sets.length);
  const [r, t, ...states] = args.slice(sets.length);
  const guarded = /AND state IN \(/.test(wherePart);
  if (guarded && (wherePart.match(/\?/g) ?? []).length !== 2 + states.length) throw new Error("guard placeholders and states differ");
  const row = rows.get(key(r, t));
  if (!row || (guarded && !states.includes(row.state))) return { changes: 0 };
  sets.forEach(({ col, keep }, i) => {
    row[col] = keep ? (values[i] ?? row[col]) : values[i];
  });
  return { changes: 1 };
};

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(text) {
      sql.push(text);
      const alter = text.match(/^ALTER TABLE etsy_imports ADD COLUMN (\w+) /);
      if (alter) {
        if (alterFailsOn === alter[1]) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push(alter[1]);
      }
    }
    prepare(text) {
      return {
        all: (...args) => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) return columns.map((name) => ({ name }));
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_imports WHERE state IN/.test(text)) {
            for (const [col] of selectList(text)) if (col !== "NULL" && !columns.includes(col)) throw new Error(`no such column: ${col}`);
            return [...rows.values()]
              .filter((row) => args.includes(row.state))
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .map((row) => project(text, row));
          }
          return [];
        },
        get: (...args) => {
          if (/FROM etsy_imports WHERE receipt_id/.test(text)) {
            for (const [col] of selectList(text)) if (col !== "NULL" && !columns.includes(col)) throw new Error(`no such column: ${col}`);
            const row = rows.get(key(args[0], args[1]));
            return row && project(text, row);
          }
          if (/COUNT\(\*\)/.test(text)) return { c: 1 };
          return undefined;
        },
        run: (...args) => {
          if (/INSERT OR IGNORE INTO etsy_imports/.test(text)) {
            const cols = text.match(/etsy_imports \(([^)]+)\) VALUES/)[1].split(", ");
            for (const col of cols) if (col !== "NULL" && !columns.includes(col)) throw new Error(`no such column: ${col}`);
            const row = Object.fromEntries(cols.map((c, i) => [c, args[i]]));
            if (rows.has(key(row.receipt_id, row.transaction_id))) return { changes: 0 };
            rows.set(key(row.receipt_id, row.transaction_id), row);
            return { changes: 1 };
          }
          if (/^UPDATE etsy_imports/.test(text)) return runUpdate(text, args);
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

import {
  initDb,
  getEtsyImport,
  claimEtsyImport,
  moveEtsyImport,
  listOpenEtsyImports,
  requestEtsyImportRetry,
} from "./db.js";

const LINE = { receiptId: "9", transactionId: "1" };
const DETAILS = { title: "Banana Print fabric by daisyhsteele", quantity: 2, listingId: 525242394 };

beforeEach(() => {
  columns = [...BASE_COLUMNS, ...E4_COLUMNS]; // a table an E4a / E4b build created
  alterFailsOn = null;
  rows = new Map();
  sql = [];
});

describe("the suggested_xwd column", () => {
  it("is in the CREATE of a new table", () => {
    initDb();
    expect(sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_imports/.test(s))).toMatch(/\bsuggested_xwd\b/);
  });

  it("is added by ALTER to a table an earlier build created, and not again at the next start", () => {
    initDb();
    expect(sql.filter((s) => /^ALTER TABLE etsy_imports ADD COLUMN/.test(s))).toEqual([
      "ALTER TABLE etsy_imports ADD COLUMN suggested_xwd TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN ship_by INTEGER",
      "ALTER TABLE etsy_imports ADD COLUMN buyer_note TEXT",
    ]);
    sql = [];
    initDb();
    expect(sql.some((s) => /^ALTER TABLE etsy_imports/.test(s))).toBe(false);
  });
});

describe("with the column", () => {
  it("a claim stores a six-digit suggestion, the bar's list reads it back, anything else is NULL", () => {
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: { ...DETAILS, suggestedXwd: "110328" } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ suggestedXwd: "110328", title: DETAILS.title });
    expect(listOpenEtsyImports()[0]).toMatchObject({ transactionId: "1", suggestedXwd: "110328" });
    for (const [i, bad] of [null, "12345", "1103289", "11032x", 110328].entries()) {
      claimEtsyImport({ receiptId: "9", transactionId: String(10 + i), state: "needs_review", details: { ...DETAILS, suggestedXwd: bad } });
      expect(getEtsyImport("9", String(10 + i)).suggestedXwd).toBeNull();
    }
    claimEtsyImport({ receiptId: "9", transactionId: "20", state: "needs_review", details: DETAILS });
    expect(getEtsyImport("9", "20").suggestedXwd).toBeNull();
  });

  it("the guarded move writes the new suggestion, clears it with null and leaves it alone when the write says nothing", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "retry", details: { ...DETAILS, suggestedXwd: "110328" } });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: DETAILS })).toBe(true);
    expect(getEtsyImport("9", "1").suggestedXwd).toBe("110328");
    rows.get("9:1").state = "retry";
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, suggestedXwd: "204411" } })).toBe(true);
    expect(getEtsyImport("9", "1").suggestedXwd).toBe("204411");
    rows.get("9:1").state = "retry";
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "y", details: { ...DETAILS, suggestedXwd: null } })).toBe(true);
    expect(getEtsyImport("9", "1").suggestedXwd).toBeNull();
  });

  it("a Retry request keeps the suggestion on the row", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "needs_review", details: { ...DETAILS, suggestedXwd: "110328" } });
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "110328" })).toEqual({ updated: true });
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "retry", suggestedXwd: "110328" });
  });
});

describe("a failed ALTER of suggested_xwd (SQLITE_BUSY at start) costs the suggestion only", () => {
  it("the bar and the import work as before; the suggestion reads as NULL and is not written", () => {
    alterFailsOn = "suggested_xwd";
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: { ...DETAILS, suggestedXwd: "110328" } })).toBe(true);
    expect(rows.get("9:1")).not.toHaveProperty("suggested_xwd");
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "needs_review", title: DETAILS.title, suggestedXwd: null });
    expect(listOpenEtsyImports()).toHaveLength(1);
    expect(listOpenEtsyImports()[0].suggestedXwd).toBeNull();
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "110328" })).toEqual({ updated: true });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, suggestedXwd: "110328" } })).toBe(true);
    expect(getEtsyImport("9", "1").suggestedXwd).toBeNull();
  });
});
