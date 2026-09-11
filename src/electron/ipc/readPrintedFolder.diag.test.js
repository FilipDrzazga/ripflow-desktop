import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Proves the point-3/4 diagnostics: a non-batch folder in a day dir is skipped (batch
// still on the list) but now leaves a BATCH_FOLDER_SKIPPED log with the full path and the
// station name, a repeat within the window does NOT log again, a degraded DB keeps the
// entry off insertLog (console only), and an unreadable day dir leaves PRINTED_DAY_UNREADABLE.
//
// WHAT IS REAL: fs (a genuine os.tmpdir tree), path, parseBatchFolderName / buildDayGroup /
// readPrintedDay / readPrintedDays (the code under test), logOnce (its real module instance).
// WHAT IS A STUB: db.js (insertLog recorded, getDbDegraded switchable via h.degraded, no
// reprint rows), getRootPath (temp root), shopProfile / getMaterialType / fabricCache.
//
// logOnce is module-level and lives across tests. beforeEach makes a FRESH mkdtemp storage
// root, so every test's folder paths (the logOnce keys) are unique and a previous test's
// window can never suppress this test's entry.

const h = vi.hoisted(() => ({ storageRoot: "", insertLog: vi.fn(), degraded: false }));

vi.mock("../helpers/db.js", () => ({
  insertLog: (...a) => h.insertLog(...a),
  getDbDegraded: () => h.degraded,
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));

import { readPrintedDay, readPrintedDays, setDiagWorkstationResolver } from "./readPrintedFolder.js";

const skippedCalls = () => h.insertLog.mock.calls.filter((c) => c[0]?.code === "BATCH_FOLDER_SKIPPED");
const dayUnreadableCalls = () => h.insertLog.mock.calls.filter((c) => c[0]?.code === "PRINTED_DAY_UNREADABLE");

const makeDay = (dayFolder, { batch = true, nonBatch = true } = {}) => {
  const dayDir = path.join(h.storageRoot, "PRINTED", dayFolder);
  if (batch) fs.mkdirSync(path.join(dayDir, "PRINTED_120000-TESTGROUP-DGEN"), { recursive: true });
  if (nonBatch) fs.mkdirSync(path.join(dayDir, "NOT_A_BATCH"), { recursive: true });
  return dayDir;
};

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-diag-"));
  h.insertLog.mockClear();
  h.degraded = false;
  setDiagWorkstationResolver(() => "TEST-PC");
});

afterEach(() => {
  vi.restoreAllMocks();
  setDiagWorkstationResolver(null); // back to the () => null default
  try { fs.rmSync(h.storageRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("readPrintedFolder diagnostics", () => {
  it("skips a non-batch folder but logs BATCH_FOLDER_SKIPPED once with path and station", async () => {
    const dayDir = makeDay("01-01-2026");

    const res = await readPrintedDay("01-01-2026");

    expect(res.success).toBe(true);
    expect(res.data.batches).toHaveLength(1); // the matching batch is still listed
    expect(res.data.batches[0].group).toBe("TESTGROUP");

    const skips = skippedCalls();
    expect(skips).toHaveLength(1);
    const entry = skips[0][0];
    expect(entry.type).toBe("warning");
    expect(entry.detail.name).toBe("NOT_A_BATCH");
    expect(entry.detail.path).toBe(path.join(dayDir, "NOT_A_BATCH"));
    expect(entry.detail.pattern).toContain("DGEN|YOKO|YUMI");
    expect(entry.workstation).toBe("TEST-PC");

    // A repeat within the window must NOT log a second time (module-level logOnce, 1h).
    await readPrintedDay("01-01-2026");
    expect(skippedCalls()).toHaveLength(1);
  });

  it("a resolver that throws leaves workstation null and never breaks the read", async () => {
    setDiagWorkstationResolver(() => { throw new Error("settings unavailable"); });
    makeDay("04-04-2026");

    const res = await readPrintedDay("04-04-2026");

    expect(res.success).toBe(true);
    expect(res.data.batches).toHaveLength(1);
    const skips = skippedCalls();
    expect(skips).toHaveLength(1);
    expect(skips[0][0].workstation).toBeNull();
  });

  it("a degraded DB keeps the entry off insertLog (console only), read still works", async () => {
    h.degraded = true;
    makeDay("05-05-2026");

    const res = await readPrintedDay("05-05-2026");

    expect(res.success).toBe(true);
    expect(res.data.batches).toHaveLength(1); // read unaffected
    expect(skippedCalls()).toHaveLength(0); // insertLog skipped while degraded
  });

  it("logs PRINTED_DAY_UNREADABLE when a day folder cannot be read", async () => {
    const printedRoot = path.join(h.storageRoot, "PRINTED");
    const dayDir = path.join(printedRoot, "02-02-2026");
    fs.mkdirSync(dayDir, { recursive: true });

    const realReaddir = fs.promises.readdir.bind(fs.promises);
    vi.spyOn(fs.promises, "readdir").mockImplementation(async (p, opts) => {
      if (String(p) === dayDir) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES", errno: -4092, syscall: "scandir" });
      }
      return realReaddir(p, opts);
    });

    const res = await readPrintedDays();

    expect(res.success).toBe(true); // enumeration survives; the bad day is a 0-batch skeleton
    const bad = dayUnreadableCalls();
    expect(bad).toHaveLength(1);
    expect(bad[0][0].detail.code).toBe("EACCES");
    expect(bad[0][0].detail.dayFolder).toBe("02-02-2026");
  });
});
