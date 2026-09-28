import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 4 (4-types-e, S2's condition): since the parser REFUSES a product size the profile cannot
// give, a rollback WITH a reason on a station whose profile could not be read parses an FQ file
// into width/height null. The rollback must still go through: the file moves back, one
// rollback_reasons row is written, and its meters is a finite number or null - never NaN, never
// a throw. (Number(null) is 0, so the estimator counts only the class margin for such a file.)
// Same harness as batchHistoryHandlers.rollback.test.js: real fs in a temp folder, the REAL
// parser; db / settings / profile / material class / estimate config are stubs.

const h = vi.hoisted(() => ({ storageRoot: "", reasons: [] }));

vi.mock("electron", () => ({}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/validateStoragePath.js", () => ({ assertStorageFilePath: async (p) => p }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ workstationName: "TEST-PC" }) }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null })); // the profile could not be read
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Polyesters" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null, getXmlWidthFromCache: () => 1420 }));
vi.mock("./createXML.js", () => ({ submitBatchToPrintFactory: vi.fn() }));
vi.mock("../helpers/db.js", () => ({
  clearFileStage: vi.fn(),
  resolveRipErrorsByFile: vi.fn(),
  insertRollbackReason: (row) => h.reasons.push(row),
  insertReprintRequest: vi.fn(),
  getOpenReprintRequestsByFileIds: () => [],
}));

import { rollbackBatchFromHistory, rollbackFileFromHistory } from "./batchHistoryHandlers.js";

const BATCH_NAME = "PRINTED_120000-TESTGROUP-YOKO"; // must match BATCH_FOLDER_RE
const FQ = "ON311936_Diana_Smith_2of6_Palatine Velvet FR_1x_Fat Quarter - 65 x 48 cm_XWD1a2b3c4d5e_FF.pdf";
const REASON = { code: "PRINTER_LINES", label: "Printer Lines" };

let batchDir;

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-rbnp-"));
  batchDir = path.join(h.storageRoot, "PRINTED", "01-01-2026", BATCH_NAME);
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, FQ), "pdf");
  h.reasons = [];
});

afterEach(() => {
  try {
    fs.rmSync(h.storageRoot, { recursive: true, force: true });
  } catch {
    // best-effort temp cleanup
  }
});

const expectSaneReason = () => {
  expect(h.reasons).toHaveLength(1);
  const row = h.reasons[0];
  expect(row.printType).toBe("FQ");
  expect(row.meters === null || Number.isFinite(row.meters)).toBe(true);
  expect(Number.isNaN(row.meters)).toBe(false);
};

describe("rollback with a reason while the shop profile is unreadable (FQ refused by the parser)", () => {
  it("batch rollback: the file moves back and the reason row is written without NaN", async () => {
    const result = await rollbackBatchFromHistory({ batchPath: batchDir, reason: REASON });
    expect(result.success).toBe(true);
    expect(result.restoredFiles).toHaveLength(1);
    expect(fs.existsSync(path.join(batchDir, FQ))).toBe(false);
    expectSaneReason();
  });

  it("single-file rollback: the same", async () => {
    const result = await rollbackFileFromHistory({ filePath: path.join(batchDir, FQ), batchPath: batchDir, reason: REASON });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(batchDir, FQ))).toBe(false);
    expectSaneReason();
  });
});
