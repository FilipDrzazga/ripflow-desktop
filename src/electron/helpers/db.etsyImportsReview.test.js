import { describe, it, expect, vi, beforeEach } from "vitest";

// The E4 half of etsy_imports in the REAL db.js: the four columns (CREATE + ALTER at start, a failed ALTER =
// the bar off and the import as before), the details at the claim, the guarded move, the bar's list and the
// two guarded requests. The fake driver reads column lists and WHERE guards out of the SQL text itself, so a
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
let alterFails;
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
  for (const { col } of sets) if (!columns.includes(col)) throw new Error(`no such column: ${col}`);
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
        if (alterFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push(alter[1]);
      }
    }
    prepare(text) {
      return {
        all: (...args) => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) return columns.map((name) => ({ name }));
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
          if (/FROM etsy_imports WHERE state IN/.test(text)) {
            for (const [col] of selectList(text)) if (!columns.includes(col)) throw new Error(`no such column: ${col}`);
            return [...rows.values()]
              .filter((row) => args.includes(row.state))
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .map((row) => project(text, row));
          }
          return [];
        },
        get: (...args) => {
          if (/FROM etsy_imports WHERE receipt_id/.test(text)) {
            for (const [col] of selectList(text)) if (!columns.includes(col)) throw new Error(`no such column: ${col}`);
            const row = rows.get(key(args[0], args[1]));
            return row && project(text, row);
          }
          if (/COUNT\(\*\)/.test(text)) return { c: 1 };
          return undefined;
        },
        run: (...args) => {
          if (/INSERT OR IGNORE INTO etsy_imports/.test(text)) {
            const cols = text.match(/etsy_imports \(([^)]+)\) VALUES/)[1].split(", ");
            for (const col of cols) if (!columns.includes(col)) throw new Error(`no such column: ${col}`);
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
  setEtsyImportState,
  moveEtsyImport,
  listOpenEtsyImports,
  requestEtsyImportRetry,
  dismissEtsyImport,
} from "./db.js";

const LINE = { receiptId: "9", transactionId: "1" };
const DETAILS = { title: "Rose fabric", quantity: 3, listingId: 1234567890 };

beforeEach(() => {
  columns = [...BASE_COLUMNS]; // a table an E3b-2 build created
  alterFails = false;
  rows = new Map();
  sql = [];
});

describe("the four E4 columns", () => {
  it("are in the CREATE of a new table", () => {
    initDb();
    const create = sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_imports/.test(s));
    for (const col of E4_COLUMNS) expect(create).toMatch(new RegExp(`\\b${col}\\b`));
  });

  it("are added by ALTER to a table an earlier build created, and not again at the next start", () => {
    initDb();
    expect(sql.filter((s) => /^ALTER TABLE etsy_imports ADD COLUMN/.test(s))).toEqual([
      "ALTER TABLE etsy_imports ADD COLUMN title TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN quantity INTEGER",
      "ALTER TABLE etsy_imports ADD COLUMN listing_id TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN manual_xwd TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN suggested_xwd TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN ship_by INTEGER",
    ]);
    sql = [];
    initDb();
    expect(sql.some((s) => /^ALTER TABLE etsy_imports/.test(s))).toBe(false);
  });
});

describe("with the columns", () => {
  it("a claim writes the details; the row reads them back (listing id as text, a bad quantity as NULL)", () => {
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: DETAILS })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "needs_review", title: "Rose fabric", quantity: 3, listingId: "1234567890", manualXwd: null });
    claimEtsyImport({ receiptId: "9", transactionId: "2", state: "needs_review", details: { title: "  ", quantity: 1.5, listingId: "" } });
    expect(getEtsyImport("9", "2")).toMatchObject({ title: null, quantity: null, listingId: null });
  });

  it("the bar's list holds needs_review, failed and retry - never done, pending or dismissed - newest first", () => {
    initDb();
    const states = ["needs_review", "failed", "retry", "done", "pending", "dismissed"];
    states.forEach((state, i) => claimEtsyImport({ receiptId: "9", transactionId: String(i), state, details: DETAILS }));
    rows.get("9:0").updated_at = "2026-10-22T10:00:00.000Z";
    rows.get("9:1").updated_at = "2026-10-22T12:00:00.000Z";
    rows.get("9:2").updated_at = "2026-10-22T11:00:00.000Z";
    const list = listOpenEtsyImports();
    expect(list.map((r) => r.state)).toEqual(["failed", "retry", "needs_review"]);
    expect(list[0]).toMatchObject({ receiptId: "9", title: "Rose fabric", quantity: 3, listingId: "1234567890", manualXwd: null });
  });

  it("a retry request moves only needs_review / failed, with the typed number", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: DETAILS });
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "173706" })).toEqual({ updated: true });
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "retry", manualXwd: "173706", reason: "No XWD" });
    // already RETRY: a second request (another station) is a guard miss, not a second write
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "204411" })).toEqual({ updated: false });
    expect(getEtsyImport("9", "1").manualXwd).toBe("173706");
  });

  it.each(["done", "pending", "dismissed"])("a retry or dismiss never reopens a %s line", (state) => {
    initDb();
    claimEtsyImport({ ...LINE, state, details: DETAILS });
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "173706" })).toEqual({ updated: false });
    expect(dismissEtsyImport(LINE)).toEqual({ updated: false });
    expect(getEtsyImport("9", "1").state).toBe(state);
  });

  it("dismiss takes a RETRY line too - one of an order Etsy no longer lists would otherwise stay in the bar for good", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "needs_review", details: DETAILS });
    requestEtsyImportRetry({ ...LINE, manualXwd: "173706" });
    expect(dismissEtsyImport(LINE)).toEqual({ updated: true });
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "dismissed", manualXwd: "173706" });
    // the importer's CAS from RETRY now matches nothing
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "pending", fileName: "a.jpg", folder: "Drill" })).toBe(false);
  });

  it("dismiss moves a needs_review or failed line to dismissed", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "failed", details: DETAILS });
    expect(dismissEtsyImport(LINE)).toEqual({ updated: true });
    expect(getEtsyImport("9", "1").state).toBe("dismissed");
  });

  it("moveEtsyImport is a CAS: true from a listed state, false from any other; file and folder kept unless given", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "retry", fileName: "old.jpg", folder: "Drill", details: DETAILS });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "No image", details: { quantity: 4 } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "needs_review", reason: "No image", fileName: "old.jpg", folder: "Drill", quantity: 4, title: "Rose fabric" });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "pending", fileName: "new.jpg", folder: "Calico" })).toBe(false);
    rows.get("9:1").state = "retry";
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "pending", fileName: "new.jpg", folder: "Calico" })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "pending", fileName: "new.jpg", folder: "Calico", reason: null });
  });

  it("moveEtsyImport with no from-state writes nothing (no unguarded UPDATE through it)", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    expect(moveEtsyImport({ ...LINE, from: [], state: "pending" })).toBeNull();
    expect(moveEtsyImport({ ...LINE, state: "pending" })).toBeNull();
    expect(getEtsyImport("9", "1").state).toBe("done");
  });
});

describe("a failed ALTER (SQLITE_BUSY at start) costs the bar, not the import", () => {
  it("the import's own calls work as before, without the columns", () => {
    alterFails = true;
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "pending", fileName: "a.jpg", folder: "Drill", details: DETAILS })).toBe(true);
    expect(setEtsyImportState({ ...LINE, state: "done" })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "done", fileName: "a.jpg" });
    expect(moveEtsyImport({ ...LINE, from: ["done"], state: "needs_review", reason: "x", details: DETAILS })).toBe(true);
  });

  it("every bar call answers 'could not' (null), never an empty list or a write", () => {
    alterFails = true;
    initDb();
    claimEtsyImport({ ...LINE, state: "needs_review" });
    expect(listOpenEtsyImports()).toBeNull();
    expect(requestEtsyImportRetry({ ...LINE, manualXwd: "173706" })).toBeNull();
    expect(dismissEtsyImport(LINE)).toBeNull();
    expect(getEtsyImport("9", "1").state).toBe("needs_review");
  });
});
