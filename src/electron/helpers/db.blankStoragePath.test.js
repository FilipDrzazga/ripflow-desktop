import { describe, it, expect, vi } from "vitest";

// ETAP 2h-3: with no storage path, initDb must open NO database. Before the refusal in
// getRootPath.js, join("", "ripflow.db") was the relative path "ripflow.db", and
// better-sqlite3 would have created a fresh, empty database in the process's working
// directory - seeded with a default profile and catalogue, looking like a real one.
//
// The real db.js and the real getRootPath.js; getSettings.js (electron-store) and the
// native driver are faked. The fake driver records every path it is asked to open.
vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getSettings.js", () => ({ getSettings: () => ({ storagePath: "", xmlPath: "" }) }));

const opened = [];
vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    constructor(p) {
      opened.push(p);
    }
    pragma() {
      return [];
    }
    exec() {}
    prepare() {
      return { all: () => [], get: () => ({ c: 1 }), run: () => ({ changes: 0 }) };
    }
    transaction(fn) {
      return fn;
    }
  },
}));

import { initDb, getShopProfile } from "./db.js";

describe("initDb with a blank storage path", () => {
  it("opens no database file, relative or otherwise", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    initDb();
    expect(opened).toEqual([]);
    expect(spy.mock.calls.some(([msg, err]) => msg === "[db] initDb failed:" && err?.code === "ERR_PATHS_NOT_SET")).toBe(true);
    spy.mockRestore();
  });

  // The rest of the app reads "no handle" as "database unreachable" (rule 6) - the same
  // degraded state as a dead NAS, not a fresh empty database.
  it("leaves no handle behind (reads fail as on a dead NAS)", () => {
    expect(() => getShopProfile()).toThrow();
  });
});
