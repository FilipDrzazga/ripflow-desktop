import { describe, it, expect, vi, beforeEach } from "vitest";

// The buyer_note column of etsy_imports in the REAL db.js (plan MSG): CREATE + ALTER at start with a flag of its own (a
// failed ALTER = no notes and nothing else lost), written at the claim, by the guarded move (a usable note only) and by
// setEtsyImportBuyerNote (a different usable note only, updated_at untouched). The fake driver is the one of
// db.etsyImportsShipBy.test.js; SQLite's own semantics are proved on the real driver in
// agents/chat/artefakty/msg-1/sql-proof.cjs.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

const BASE_COLUMNS = ["receipt_id", "transaction_id", "state", "file_name", "folder", "reason", "created_at", "updated_at"];
const E4_COLUMNS = ["title", "quantity", "listing_id", "manual_xwd", "suggested_xwd"];

let columns; // the columns etsy_imports has before this start
let alterFailsOn; // the column whose ALTER fails with SQLITE_BUSY
let updateFails; // the next UPDATE throws SQLITE_BUSY
let rows; // "receipt:transaction" -> { column: value }
let sql;
let updates; // the UPDATE statements run

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
  updates.push(text);
  if (updateFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
  const [, setPart, wherePart] = text.match(/^UPDATE etsy_imports SET (.+) WHERE (.+)$/);
  const sets = [...setPart.matchAll(/(\w+) = (COALESCE\(\?, \w+\)|\?)/g)].map((m) => ({ col: m[1], keep: m[2] !== "?" }));
  for (const { col } of sets) if (!columns.includes(col)) throw new Error(`no such column: ${col}`);
  const values = args.slice(0, sets.length);
  const rest = args.slice(sets.length);
  const [r, t] = rest;
  const row = rows.get(key(r, t));
  if (!row) return { changes: 0 };
  const isNot = wherePart.match(/AND (\w+) IS NOT \?$/);
  if (isNot) {
    if (!columns.includes(isNot[1])) throw new Error(`no such column: ${isNot[1]}`);
    if ((row[isNot[1]] ?? null) === rest[2]) return { changes: 0 };
  } else if (/AND state IN \(/.test(wherePart)) {
    const states = rest.slice(2);
    if ((wherePart.match(/\?/g) ?? []).length !== 2 + states.length) throw new Error("guard placeholders and states differ");
    if (!states.includes(row.state)) return { changes: 0 };
  }
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
        all: () => {
          if (/PRAGMA table_info\(etsy_imports\)/.test(text)) return columns.map((name) => ({ name }));
          if (/PRAGMA table_info\(fabrics\)/.test(text)) return ["name", "preferred_printer"].map((name) => ({ name }));
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

import { initDb, getEtsyImport, claimEtsyImport, moveEtsyImport, setEtsyImportBuyerNote } from "./db.js";

const LINE = { receiptId: "9", transactionId: "1" };
const DETAILS = { title: "Banana Print fabric by daisyhsteele", quantity: 2, listingId: 525242394 };
const NOTE = "Please send it before Friday.\nIt is a gift.";
const OTHER = "Could you add a note card?";

beforeEach(() => {
  columns = [...BASE_COLUMNS, ...E4_COLUMNS, "ship_by"]; // a table an ETA build created
  alterFailsOn = null;
  updateFails = false;
  rows = new Map();
  sql = [];
  updates = [];
});

describe("the buyer_note column", () => {
  it("is in the CREATE of a new table, as TEXT", () => {
    initDb();
    expect(sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_imports/.test(s))).toMatch(/\bbuyer_note\s+TEXT\b/);
  });

  it("is added by ALTER to a table an ETA build created, and not again at the next start", () => {
    initDb();
    expect(sql.filter((s) => /^ALTER TABLE etsy_imports ADD COLUMN/.test(s))).toEqual([
      "ALTER TABLE etsy_imports ADD COLUMN suggested_file TEXT",
      "ALTER TABLE etsy_imports ADD COLUMN buyer_note TEXT",
    ]);
    sql = [];
    initDb();
    expect(sql.some((s) => /^ALTER TABLE etsy_imports/.test(s))).toBe(false);
  });
});

describe("with the column", () => {
  it("a claim stores the note cleaned and getEtsyImport reads it back as buyerNote", () => {
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: { ...DETAILS, buyerNote: `  ${NOTE.replace("\n", "\r\n")}  ` } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "needs_review", title: DETAILS.title, buyerNote: NOTE });
  });

  it("a claim without a usable note stores NULL - and the row still says buyerNote", () => {
    initDb();
    for (const [i, bad] of [undefined, null, "", "   ", 42, {}].entries()) {
      expect(claimEtsyImport({ receiptId: "9", transactionId: String(10 + i), state: "needs_review", details: { ...DETAILS, buyerNote: bad } })).toBe(true);
      const row = getEtsyImport("9", String(10 + i));
      expect(row).toHaveProperty("buyerNote");
      expect(row.buyerNote).toBeNull();
    }
    expect(claimEtsyImport({ receiptId: "9", transactionId: "30", state: "pending" })).toBe(true);
    expect(getEtsyImport("9", "30").buyerNote).toBeNull();
  });

  it("the guarded move writes a usable note and never clears a stored one", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "retry", details: { ...DETAILS, buyerNote: NOTE } });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, buyerNote: OTHER } })).toBe(true);
    expect(getEtsyImport("9", "1").buyerNote).toBe(OTHER);
    for (const bad of [undefined, null, "", "  ", 7]) {
      rows.get("9:1").state = "retry";
      expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, buyerNote: bad } })).toBe(true);
      expect(getEtsyImport("9", "1").buyerNote).toBe(OTHER);
    }
    rows.get("9:1").state = "retry";
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x" })).toBe(true);
    expect(getEtsyImport("9", "1").buyerNote).toBe(OTHER);
  });

  it("a move the guard refuses writes no note either", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "dismissed", details: { ...DETAILS, buyerNote: NOTE } });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "pending", details: { ...DETAILS, buyerNote: OTHER } })).toBe(false);
    expect(getEtsyImport("9", "1").buyerNote).toBe(NOTE);
  });

  it("setEtsyImportBuyerNote fills a NULL and replaces a stored note, and leaves updated_at alone", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    const stamp = rows.get("9:1").updated_at;
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: NOTE })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ buyerNote: NOTE, state: "done", updatedAt: stamp });
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: OTHER })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ buyerNote: OTHER, updatedAt: stamp });
    expect(updates.every((u) => !/updated_at/.test(u))).toBe(true);
  });

  it("setEtsyImportBuyerNote stores the CLEANED note", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: ` ${NOTE.replace("\n", "\r\n")}\t ` })).toBe(true);
    expect(getEtsyImport("9", "1").buyerNote).toBe(NOTE);
  });

  it("setEtsyImportBuyerNote with the same note changes nothing (false), and false for a line without a row", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, buyerNote: NOTE } });
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: NOTE })).toBe(false);
    expect(getEtsyImport("9", "1").buyerNote).toBe(NOTE);
    expect(setEtsyImportBuyerNote({ receiptId: "9", transactionId: "404", buyerNote: NOTE })).toBe(false);
  });

  it("setEtsyImportBuyerNote refuses a value that is no note (null) without touching the table", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, buyerNote: NOTE } });
    for (const bad of [undefined, null, "", "   ", 42]) {
      expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: bad })).toBeNull();
    }
    expect(updates).toEqual([]);
    expect(getEtsyImport("9", "1").buyerNote).toBe(NOTE);
  });

  it("a failed write of the note answers null", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    updateFails = true;
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: NOTE })).toBeNull();
  });
});

describe("a failed ALTER of buyer_note (SQLITE_BUSY at start) costs the note only", () => {
  it("claim and move work as before without the column, the row has no buyerNote key, setEtsyImportBuyerNote answers null", () => {
    alterFailsOn = "buyer_note";
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "retry", reason: "No XWD", details: { ...DETAILS, buyerNote: NOTE, shipBy: 1761523200 } })).toBe(true);
    expect(rows.get("9:1")).not.toHaveProperty("buyer_note");
    const row = getEtsyImport("9", "1");
    expect(row).toMatchObject({ state: "retry", title: DETAILS.title, shipBy: 1761523200 });
    expect(row).not.toHaveProperty("buyerNote");
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, buyerNote: OTHER } })).toBe(true);
    expect(getEtsyImport("9", "1").state).toBe("needs_review");
    updates = [];
    expect(setEtsyImportBuyerNote({ ...LINE, buyerNote: OTHER })).toBeNull();
    expect(updates).toEqual([]);
  });

  it("a failed ALTER of ship_by does not cost the note", () => {
    columns = [...BASE_COLUMNS, ...E4_COLUMNS];
    alterFailsOn = "ship_by";
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, buyerNote: NOTE } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ buyerNote: NOTE });
    expect(getEtsyImport("9", "1")).not.toHaveProperty("shipBy");
  });
});
