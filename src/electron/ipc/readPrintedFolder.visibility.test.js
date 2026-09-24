import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 2e step 1, pinned where the defect lived: readPrintedFolder.js decides which batch
// folders EXIST for BatchHistory. Before the shared parser, two real folders were dropped:
// a collision-suffixed one (createBatch.js appends `_<n>` when the name is taken) and one
// of a printer outside the hardcoded DGEN|YOKO|YUMI. Both must now be listed, with the
// code upper-cased and without the suffix; a createBatch temp folder must still not be.
//
// Same harness as readPrintedFolder.diag.test.js: a genuine os.tmpdir tree and the real
// readPrintedDay / readPrintedDays; db.js, getRootPath, shopProfile, getMaterialType and
// fabricCache stubbed.

const h = vi.hoisted(() => ({ storageRoot: "", insertLog: vi.fn() }));

vi.mock("../helpers/db.js", () => ({
  insertLog: (...a) => h.insertLog(...a),
  getDbDegraded: () => false,
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));

import { readPrintedDay, readPrintedDays, setDiagWorkstationResolver } from "./readPrintedFolder.js";

const DAY = "24-09-2026";
const makeFolders = (...names) => {
  const dayDir = path.join(h.storageRoot, "PRINTED", DAY);
  for (const n of names) fs.mkdirSync(path.join(dayDir, n), { recursive: true });
};
const skippedNames = () =>
  h.insertLog.mock.calls.filter((c) => c[0]?.code === "BATCH_FOLDER_SKIPPED").map((c) => c[0].detail.name);

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-vis-"));
  h.insertLog.mockClear();
  setDiagWorkstationResolver(() => "TEST-PC");
});

afterEach(() => {
  vi.restoreAllMocks();
  setDiagWorkstationResolver(null);
  try { fs.rmSync(h.storageRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("readPrintedFolder - which batch folders exist (2e step 1)", () => {
  it("lists a collision-suffixed batch under its real printer and group", async () => {
    makeFolders("PRINTED_120000-TESTGROUP-DGEN", "PRINTED_120000-TESTGROUP-DGEN_1");

    const res = await readPrintedDay(DAY);

    expect(res.success).toBe(true);
    const found = res.data.batches.map((b) => [b.group, b.printer]).sort();
    expect(found).toEqual([["TESTGROUP", "DGEN"], ["TESTGROUP", "DGEN"]]);
    expect(skippedNames()).toEqual([]);
  });

  it("lists a batch of a printer outside the old list, code upper-cased", async () => {
    makeFolders("PRINTED_120100-TESTGROUP-mimaki2");

    const res = await readPrintedDay(DAY);

    expect(res.data.batches.map((b) => b.printer)).toEqual(["MIMAKI2"]);
    expect(skippedNames()).toEqual([]);
  });

  it("still skips a createBatch temp folder, and counts only real batches", async () => {
    makeFolders("PRINTED_120000-TESTGROUP-DGEN_1", ".tmp-PRINTED_120200-TESTGROUP-DGEN-4242-1727170000000");

    const day = await readPrintedDay(DAY);
    const days = await readPrintedDays();

    expect(day.data.batches).toHaveLength(1);
    expect(days.data.find((d) => d.dayFolder === DAY).totalBatches).toBe(1);
  });
});
