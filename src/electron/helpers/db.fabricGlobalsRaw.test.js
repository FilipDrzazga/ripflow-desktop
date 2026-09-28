import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 2g-3a: getFabricGlobalsRaw - what fabric_globals really holds, or null. The REAL db.js
// with a fake driver, exactly as db.shopProfile.test.js does it (see its header for why and
// what this does not prove). The point: it never fills in a default, so the profile migration
// cannot mistake Alex's defaults for a shop's own numbers. (getFabricGlobals, the reader that
// DID fill in the seed, went in 1.0.26 with the dual write.)

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

let globalsRows;
let globalsThrows;

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {}
    prepare(sql) {
      return {
        all: () => {
          if (/FROM fabric_globals/.test(sql)) {
            if (globalsThrows) throw new Error("SQLITE_IOERR");
            return globalsRows;
          }
          return [];
        },
        // non-zero counts keep initDb's seeding out of the way (see db.shopProfile.test.js)
        get: () => (/COUNT\(\*\)/.test(sql) ? { c: 1 } : undefined),
        run: () => ({ changes: 0 }),
      };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
  },
}));

import { initDb, getFabricGlobalsRaw } from "./db.js";

describe("getFabricGlobalsRaw", () => {
  beforeEach(() => {
    globalsRows = [];
    globalsThrows = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // db.js keeps its handle in module state, so this case has to run before initDb
  it("no database handle -> null", () => {
    expect(getFabricGlobalsRaw()).toBeNull();
  });

  it("returns exactly the rows the table holds - no seed key added", () => {
    initDb();
    globalsRows = [{ key: "marginCotton", value: 12 }, { key: "defaultRollWidthPoly", value: 1600 }];
    expect(getFabricGlobalsRaw()).toEqual({ marginCotton: 12, defaultRollWidthPoly: 1600 });
  });

  it("an empty table is {} (readable, nothing set) - not null and not the seed", () => {
    initDb();
    globalsRows = [];
    expect(getFabricGlobalsRaw()).toEqual({});
  });

  it("a SELECT that throws -> null, never the seed", () => {
    initDb();
    globalsThrows = true;
    expect(getFabricGlobalsRaw()).toBeNull();
  });
});
