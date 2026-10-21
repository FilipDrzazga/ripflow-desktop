import { describe, it, expect, vi, beforeEach } from "vitest";

// E3a-2 (W1): file_stages.ext is added at start. When the ALTER fails (SQLITE_BUSY on the first start
// of a new build) the INSERT is prepared without the column: a PDF row (ext NULL) still registers, an
// IMAGE row is refused (insertFileStage returns false - Production would look for X.pdf and never find
// the file; submitBatch turns the false into its tracking warning). With the column both go in, an
// image with its extension and a PDF as NULL. The REAL db.js with a fake driver whose SQL fails the
// way SQLite does on a missing column (the pattern of db.fabricPreferredPrinterMissing.test.js).

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let alterFails;
let columns; // PRAGMA table_info(file_stages)
let inserts; // { sql, args } of every file_stages INSERT

const hasExt = () => columns.includes("ext");

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec(sql) {
      if (/ALTER TABLE file_stages ADD COLUMN ext/.test(sql)) {
        if (alterFails) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
        columns.push("ext");
      }
    }
    prepare(sql) {
      const isStageInsert = /INSERT OR REPLACE INTO file_stages/.test(sql);
      if (isStageInsert && /, ext\)/.test(sql) && !hasExt()) throw new Error("table file_stages has no column named ext");
      return {
        all: () => (/PRAGMA table_info\(file_stages\)/.test(sql) ? columns.map((name) => ({ name })) : []),
        get: () => (/COUNT\(\*\)/.test(sql) ? { c: 1 } : undefined),
        run: (...args) => {
          if (isStageInsert) inserts.push({ sql, args });
          return { changes: 1 };
        },
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
    close() {}
  },
}));

import { initDb, insertFileStage } from "./db.js";

const row = (file_id, ext) => ({
  file_id,
  batch_path: "C:/tmp/PRINTED/21-10-2026/PRINTED_120000-ETSY-DGEN",
  updated_at: "2026-10-21T12:00:00.000Z",
  ...(ext === undefined ? {} : { ext }),
});

describe("file_stages.ext", () => {
  beforeEach(() => {
    alterFails = false;
    columns = ["file_id", "batch_path", "stage"];
    inserts = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("with the column", () => {
    beforeEach(() => initDb());

    it("the start adds it (harness guard)", () => {
      expect(hasExt()).toBe(true);
    });

    it("an image row stores its extension as the name spells it", () => {
      expect(insertFileStage(row("ET1_tile", ".PNG"))).toBe(true);
      expect(inserts.at(-1).args.at(-1)).toBe("PNG");
    });

    it("a PDF row stores NULL, whatever is passed (NULL = pdf)", () => {
      expect(insertFileStage(row("ON1_a", ".pdf"))).toBe(true);
      expect(inserts.at(-1).args.at(-1)).toBeNull();
      expect(insertFileStage(row("ON2_b"))).toBe(true);
      expect(inserts.at(-1).args.at(-1)).toBeNull();
    });

    it("an unknown extension is stored as NULL, never raw", () => {
      expect(insertFileStage(row("ON3_c", "..\\x"))).toBe(true);
      expect(inserts.at(-1).args.at(-1)).toBeNull();
    });
  });

  describe("without the column (the ALTER failed)", () => {
    beforeEach(() => {
      alterFails = true;
      initDb();
    });

    it("harness guard: the column is missing", () => {
      expect(hasExt()).toBe(false);
    });

    it("a PDF row still registers, with no ext sent", () => {
      expect(insertFileStage(row("ON1_a", ".pdf"))).toBe(true);
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).not.toMatch(/\bext\b/);
      expect(inserts[0].args).toHaveLength(17);
    });

    it("an image row is refused and writes nothing", () => {
      expect(insertFileStage(row("ET1_tile", ".png"))).toBe(false);
      expect(inserts).toHaveLength(0);
    });
  });
});
