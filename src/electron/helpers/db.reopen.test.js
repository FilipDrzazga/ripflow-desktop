import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-drop, S2's follow-ups to 4-retry): initDb run again by "Reload shop data".
// (1) a database that opens clears the degraded state, so "Database unavailable" goes away with
//     the reopen instead of waiting for the first write;
// (2) a failed initDb closes the handle the constructor opened, so a failed Retry leaves no
//     connection behind.
// Fake driver, same convention as db.seedProfile.test.js: db.js's control flow, not SQLite.

vi.mock("electron", () => ({
  app: { getPath: () => "C:/tmp", getAppPath: () => "C:/tmp" },
}));
vi.mock("./getRootPath.js", () => ({
  getStorageRootPath: () => "C:/tmp/ripflow-test",
}));

const h = vi.hoisted(() => ({ failExec: false, closes: 0 }));

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    pragma() {
      return [];
    }
    exec() {
      if (h.failExec) throw new Error("SQLITE_IOERR");
    }
    prepare() {
      return { all: () => [], get: () => ({ c: 1 }), run: () => ({ changes: 1 }) };
    }
    transaction(fn) {
      return (...args) => fn(...args);
    }
    close() {
      h.closes += 1;
    }
  },
}));

import { initDb, isDbOpen, holdFile, setDbErrorSink, getDbDegraded } from "./db.js";

let events;
beforeEach(() => {
  h.failExec = false;
  h.closes = 0;
  events = [];
  setDbErrorSink((channel) => events.push(channel));
});

describe("initDb run again after a start without a database", () => {
  it("a failed initDb closes the half-open handle and leaves no database", () => {
    h.failExec = true;
    initDb();
    expect(isDbOpen()).toBe(false);
    expect(h.closes).toBe(1);
  });

  it("the reopen clears the degraded state and tells the renderer once", () => {
    h.failExec = true;
    initDb();
    holdFile("f1"); // a write with no database: degraded, "Database unavailable"
    expect(getDbDegraded()).toBe(true);
    expect(events).toEqual(["db:error"]);

    h.failExec = false;
    initDb();
    expect(isDbOpen()).toBe(true);
    expect(getDbDegraded()).toBe(false);
    expect(events).toEqual(["db:error", "db:recovered"]);
  });

  it("an open that was never degraded emits nothing", () => {
    initDb();
    expect(isDbOpen()).toBe(true);
    expect(events).toEqual([]);
  });
});
