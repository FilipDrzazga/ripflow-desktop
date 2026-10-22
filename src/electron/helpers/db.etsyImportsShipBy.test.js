import { describe, it, expect, vi, beforeEach } from "vitest";

// The ship_by column of etsy_imports in the REAL db.js (plan ETA): CREATE + ALTER at start with a flag of its own (a
// failed ALTER = no dates and nothing else lost), written at the claim, by the guarded move (a valid date only) and by
// setEtsyImportShipBy (a different valid date only, updated_at untouched). Same fake driver as
// db.etsyImportsSuggestion.test.js plus the null-safe "ship_by IS NOT ?" guard; SQLite's own semantics of that guard
// are proved on the real driver in agents/chat/artefakty/eta-1/sql-proof.cjs.

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

import { initDb, getEtsyImport, claimEtsyImport, moveEtsyImport, setEtsyImportShipBy } from "./db.js";

const LINE = { receiptId: "9", transactionId: "1" };
const DETAILS = { title: "Banana Print fabric by daisyhsteele", quantity: 2, listingId: 525242394 };
const MON = 1761523200; // Mon 27 Oct 2025 00:00 UTC
const WED = 1761696000;

beforeEach(() => {
  columns = [...BASE_COLUMNS, ...E4_COLUMNS]; // a table an E4c build created
  alterFailsOn = null;
  updateFails = false;
  rows = new Map();
  sql = [];
  updates = [];
});

describe("the ship_by column", () => {
  it("is in the CREATE of a new table, as an INTEGER", () => {
    initDb();
    expect(sql.find((s) => /CREATE TABLE IF NOT EXISTS etsy_imports/.test(s))).toMatch(/\bship_by\s+INTEGER\b/);
  });

  it("is added by ALTER to a table an earlier build created, and not again at the next start", () => {
    initDb();
    expect(sql.filter((s) => /^ALTER TABLE etsy_imports ADD COLUMN/.test(s))).toEqual(["ALTER TABLE etsy_imports ADD COLUMN ship_by INTEGER"]);
    sql = [];
    initDb();
    expect(sql.some((s) => /^ALTER TABLE etsy_imports/.test(s))).toBe(false);
  });
});

describe("with the column", () => {
  it("a claim stores a valid date and getEtsyImport reads it back as shipBy", () => {
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "needs_review", reason: "No XWD", details: { ...DETAILS, shipBy: MON } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ state: "needs_review", title: DETAILS.title, shipBy: MON });
  });

  it("a claim without a date, or with one that is not whole seconds above 0, stores NULL - and the row still says shipBy", () => {
    initDb();
    for (const [i, bad] of [undefined, null, 0, -5, 1.5, "1761523200", "abc", MON * 1000].entries()) {
      expect(claimEtsyImport({ receiptId: "9", transactionId: String(10 + i), state: "needs_review", details: { ...DETAILS, shipBy: bad } })).toBe(true);
      const row = getEtsyImport("9", String(10 + i));
      expect(row).toHaveProperty("shipBy");
      expect(row.shipBy).toBeNull();
    }
    expect(claimEtsyImport({ receiptId: "9", transactionId: "30", state: "pending" })).toBe(true);
    expect(getEtsyImport("9", "30").shipBy).toBeNull();
  });

  it("the guarded move writes a valid date and never clears a stored one", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "retry", details: { ...DETAILS, shipBy: MON } });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, shipBy: WED } })).toBe(true);
    expect(getEtsyImport("9", "1").shipBy).toBe(WED);
    for (const bad of [undefined, null, 0, "abc", 2.5]) {
      rows.get("9:1").state = "retry";
      expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, shipBy: bad } })).toBe(true);
      expect(getEtsyImport("9", "1").shipBy).toBe(WED);
    }
    rows.get("9:1").state = "retry";
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x" })).toBe(true);
    expect(getEtsyImport("9", "1").shipBy).toBe(WED);
  });

  it("a move the guard refuses writes no date either", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "dismissed", details: { ...DETAILS, shipBy: MON } });
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "pending", details: { ...DETAILS, shipBy: WED } })).toBe(false);
    expect(getEtsyImport("9", "1").shipBy).toBe(MON);
  });

  it("setEtsyImportShipBy fills a NULL and moves a stored date, and leaves updated_at alone", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    const stamp = rows.get("9:1").updated_at;
    expect(setEtsyImportShipBy({ ...LINE, shipBy: MON })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ shipBy: MON, state: "done", updatedAt: stamp });
    expect(setEtsyImportShipBy({ ...LINE, shipBy: WED })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ shipBy: WED, updatedAt: stamp });
    expect(updates.every((u) => !/updated_at/.test(u))).toBe(true);
  });

  it("setEtsyImportShipBy with the same date changes nothing (false), and false for a line without a row", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, shipBy: MON } });
    expect(setEtsyImportShipBy({ ...LINE, shipBy: MON })).toBe(false);
    expect(getEtsyImport("9", "1").shipBy).toBe(MON);
    expect(setEtsyImportShipBy({ receiptId: "9", transactionId: "404", shipBy: MON })).toBe(false);
  });

  it("setEtsyImportShipBy refuses a value that is not a date (null) without touching the table", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, shipBy: MON } });
    for (const bad of [undefined, null, 0, -1, 1.5, "1761523200", MON * 1000]) {
      expect(setEtsyImportShipBy({ ...LINE, shipBy: bad })).toBeNull();
    }
    expect(updates).toEqual([]);
    expect(getEtsyImport("9", "1").shipBy).toBe(MON);
  });

  it("a failed write of the date answers null", () => {
    initDb();
    claimEtsyImport({ ...LINE, state: "done", details: DETAILS });
    updateFails = true;
    expect(setEtsyImportShipBy({ ...LINE, shipBy: MON })).toBeNull();
  });
});

describe("a failed ALTER of ship_by (SQLITE_BUSY at start) costs the date only", () => {
  it("claim and move work as before without the column, the row has no shipBy key, setEtsyImportShipBy answers null", () => {
    alterFailsOn = "ship_by";
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "retry", reason: "No XWD", details: { ...DETAILS, shipBy: MON, suggestedXwd: "110328" } })).toBe(true);
    expect(rows.get("9:1")).not.toHaveProperty("ship_by");
    const row = getEtsyImport("9", "1");
    expect(row).toMatchObject({ state: "retry", title: DETAILS.title, suggestedXwd: "110328" });
    expect(row).not.toHaveProperty("shipBy");
    expect(moveEtsyImport({ ...LINE, from: ["retry"], state: "needs_review", reason: "x", details: { ...DETAILS, shipBy: WED } })).toBe(true);
    expect(getEtsyImport("9", "1").state).toBe("needs_review");
    updates = [];
    expect(setEtsyImportShipBy({ ...LINE, shipBy: WED })).toBeNull();
    expect(updates).toEqual([]);
  });

  it("a failed ALTER of suggested_xwd does not cost the date", () => {
    columns = [...BASE_COLUMNS, "title", "quantity", "listing_id", "manual_xwd"];
    alterFailsOn = "suggested_xwd";
    initDb();
    expect(claimEtsyImport({ ...LINE, state: "done", details: { ...DETAILS, shipBy: MON } })).toBe(true);
    expect(getEtsyImport("9", "1")).toMatchObject({ suggestedXwd: null, shipBy: MON });
  });
});
