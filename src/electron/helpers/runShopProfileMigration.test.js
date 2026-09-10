import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// db.js is the single edge of this module, and vi.mock replaces it wholesale - the same
// convention shopProfile.test.js uses. That is why the orchestrator was pulled out of
// ipc/index.js: there it was unreachable, and the abort-on-failed-dump branch below would
// have been a guard nobody could show to work.

let rawRow;
let rawThrows;
let dumpResult;
let backupResult;
let backupThrows;
let casResult;

const migrateShopProfileRow = vi.fn();
const dumpShopProfileBlob = vi.fn();
const signalStartupProblem = vi.fn();
const backupDb = vi.fn();

vi.mock("./db.js", () => ({
  getShopProfileRaw: () => {
    if (rawThrows) throw new Error("db down");
    return rawRow;
  },
  migrateShopProfileRow: (...args) => migrateShopProfileRow(...args),
  dumpShopProfileBlob: (...args) => dumpShopProfileBlob(...args),
  signalStartupProblem: (...args) => signalStartupProblem(...args),
  backupDb: (...args) => backupDb(...args),
}));

import { runShopProfileMigration } from "./runShopProfileMigration.js";
import { PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";

// A pre-2f row, serialised the way SQLite actually holds it: one line of JSON.
const PRE_2F = {
  schemaVersion: 1,
  printers: [{ code: "DGEN" }],
  workstationRoles: ["", "cotton", "qc"],
};

beforeEach(() => {
  rawRow = JSON.stringify(PRE_2F);
  rawThrows = false;
  dumpResult = { success: true, path: "C:/tmp/backups/shop_profile_pre_v2_x.json" };
  backupResult = { success: true, path: "C:/tmp/backups/ripflow_2026-09-11.db" };
  backupThrows = false;
  casResult = { updated: true };

  migrateShopProfileRow.mockReset().mockImplementation(() => casResult);
  dumpShopProfileBlob.mockReset().mockImplementation(() => dumpResult);
  signalStartupProblem.mockReset();
  backupDb.mockReset().mockImplementation(() => {
    if (backupThrows) return Promise.reject(new Error("smb gone"));
    return Promise.resolve(backupResult);
  });

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runShopProfileMigration - the happy path", () => {
  it("dumps, backs up and writes, in that order", async () => {
    await runShopProfileMigration();

    expect(dumpShopProfileBlob).toHaveBeenCalledWith(rawRow, PROFILE_SCHEMA_VERSION);
    expect(backupDb).toHaveBeenCalledWith(true);
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);

    const dumpOrder = dumpShopProfileBlob.mock.invocationCallOrder[0];
    const backupOrder = backupDb.mock.invocationCallOrder[0];
    const writeOrder = migrateShopProfileRow.mock.invocationCallOrder[0];
    expect(dumpOrder).toBeLessThan(backupOrder);
    expect(backupOrder).toBeLessThan(writeOrder);
  });

  it("writes the migrated profile and stamps the row as a migration", async () => {
    await runShopProfileMigration();

    const [, nextJson, workstation] = migrateShopProfileRow.mock.calls[0];
    const written = JSON.parse(nextJson);
    expect(written.schemaVersion).toBe(2);
    expect(written.scanRules).toHaveLength(4);
    expect(written.workstationRoles).toBeUndefined();
    expect(workstation).toBe(`migration:v${PROFILE_SCHEMA_VERSION}`);
  });

  // Z3. A compare-and-swap against a re-serialised value matches zero rows on every run,
  // and the symptom is indistinguishable from "already migrated".
  it("compares against the ORIGINAL column text, not a re-serialisation of it", async () => {
    rawRow = JSON.stringify(PRE_2F, null, 2); // same object, different bytes
    expect(rawRow).not.toBe(JSON.stringify(JSON.parse(rawRow)));

    await runShopProfileMigration();

    const [expectedJson] = migrateShopProfileRow.mock.calls[0];
    expect(expectedJson).toBe(rawRow);
    expect(expectedJson).not.toBe(JSON.stringify(JSON.parse(rawRow)));
  });
});

describe("runShopProfileMigration - when it must write nothing", () => {
  it("does nothing at all when there is no row", async () => {
    rawRow = null;
    await runShopProfileMigration();
    expect(dumpShopProfileBlob).not.toHaveBeenCalled();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });

  it("does nothing when the row cannot be read", async () => {
    rawThrows = true;
    await runShopProfileMigration();
    expect(dumpShopProfileBlob).not.toHaveBeenCalled();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });

  it("does nothing when the row is not valid JSON", async () => {
    rawRow = "{ not json";
    await runShopProfileMigration();
    expect(dumpShopProfileBlob).not.toHaveBeenCalled();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });

  it("skips the dump, the backup and the write when nothing changed", async () => {
    rawRow = JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, scanRules: [] });
    await runShopProfileMigration();
    expect(dumpShopProfileBlob).not.toHaveBeenCalled();
    expect(backupDb).not.toHaveBeenCalled();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
  });

  it("ABORTS without writing when the pre-migration dump fails", async () => {
    dumpResult = { success: false, error: "EACCES" };
    await runShopProfileMigration();
    expect(migrateShopProfileRow).not.toHaveBeenCalled();
    expect(backupDb).not.toHaveBeenCalled();
    expect(signalStartupProblem).toHaveBeenCalledWith("shopProfileMigrationDump");
  });
});

describe("runShopProfileMigration - failures that must NOT stop it", () => {
  it("still writes when the whole-database backup fails", async () => {
    backupResult = { success: false, error: "network" };
    await runShopProfileMigration();
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);
    expect(signalStartupProblem).not.toHaveBeenCalled();
  });

  it("still writes when the whole-database backup throws", async () => {
    backupThrows = true;
    await runShopProfileMigration();
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);
  });

  it("survives a compare-and-swap that matched nothing", async () => {
    casResult = { updated: false };
    await expect(runShopProfileMigration()).resolves.toBeUndefined();
    expect(migrateShopProfileRow).toHaveBeenCalledTimes(1);
  });
});
