import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 2g-3a: the runner reads fabric_globals RAW at migration time and hands them to the
// pure function. db.js is the single edge, mocked wholesale as in runShopProfileMigration.test.js.
let rawRow;
let globals;
let globalsThrows;
const migrateShopProfileRow = vi.fn();

vi.mock("./db.js", () => ({
  getShopProfileRaw: () => rawRow,
  getFabricGlobalsRaw: () => {
    if (globalsThrows) throw new Error("fabric_globals gone");
    return globals;
  },
  migrateShopProfileRow: (...args) => migrateShopProfileRow(...args),
  dumpShopProfileBlob: () => ({ success: true, path: "C:/tmp/dump.json" }),
  signalStartupProblem: () => {},
  backupDb: () => Promise.resolve({ success: true, path: "C:/tmp/b.db" }),
}));

import { runShopProfileMigration } from "./runShopProfileMigration.js";

const V2 = {
  schemaVersion: 2,
  materialClasses: [
    { name: "Cottons", margin: 10, defaultXmlWidth: 1420, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultXmlWidth: 1420, defaultRollWidth: 1550 },
  ],
};

let warn;
beforeEach(() => {
  rawRow = JSON.stringify(V2);
  globals = { marginCotton: 11, marginPoly: 6, defaultRollWidthCotton: 1430, defaultRollWidthPoly: 1560 };
  globalsThrows = false;
  migrateShopProfileRow.mockReset().mockImplementation(() => ({ updated: true }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runShopProfileMigration - v2 -> v3", () => {
  it("writes v3 with the numbers read from fabric_globals, compare-and-swap on the raw text", async () => {
    await runShopProfileMigration();
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);
    const [expected, next, workstation] = migrateShopProfileRow.mock.calls[0];
    expect(expected).toBe(rawRow);
    expect(workstation).toBe("migration:v3");
    expect(JSON.parse(next).materialClasses).toEqual([
      { name: "Cottons", margin: 11, defaultRollWidth: 1430 },
      { name: "Polyesters", margin: 6, defaultRollWidth: 1560 },
    ]);
    expect(JSON.parse(next).schemaVersion).toBe(3);
  });

  it("fabric_globals unreadable (null): nothing written, the stop is logged", async () => {
    globals = null;
    await runShopProfileMigration();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => /stopped before the next version/.test(c[0]))).toBe(true);
  });

  it("fabric_globals read throws: treated as unreadable - nothing written, the app goes on", async () => {
    globalsThrows = true;
    await expect(runShopProfileMigration()).resolves.toBeUndefined();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });

  it("another station migrated first (CAS matched no row): nothing else happens", async () => {
    migrateShopProfileRow.mockImplementation(() => ({ updated: false }));
    await runShopProfileMigration();
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some((c) => /another station migrated it/.test(c[0]))).toBe(true);
  });

  it("a row already at v3: no read of fabric_globals is needed and nothing is written", async () => {
    rawRow = JSON.stringify({ schemaVersion: 3, materialClasses: [] });
    await runShopProfileMigration();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });
});
