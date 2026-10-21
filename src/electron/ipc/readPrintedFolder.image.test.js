import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// E3a-2: the PRINTED readers list an image tile (the Etsy route) next to the PDFs - BatchHistory
// (readPrintedDay) and the Ctrl+F sweep (readPrintedDayNames) - and still leave out what is not a print
// file. Same harness as readPrintedFolder.dayNames.test.js: a genuine os.tmpdir tree, the real readers, db.js /
// getRootPath / shopProfile stubbed.

const h = vi.hoisted(() => ({ storageRoot: "", insertLog: vi.fn() }));

vi.mock("../helpers/db.js", () => ({
  insertLog: (...a) => h.insertLog(...a),
  getDbDegraded: () => false,
  getOpenReprintRequestsByFileIds: () => [],
  getRollbackReasonsByBatch: () => [],
  getFileStagesByBatch: () => [],
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));

import { readPrintedDay, readPrintedDayNames, setDiagWorkstationResolver } from "./readPrintedFolder.js";

const DAY = "21-10-2026";
const BATCH = "PRINTED_101010-ETSY-DGEN";
const batchDir = () => path.join(h.storageRoot, "PRINTED", DAY, BATCH);

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-image-"));
  fs.mkdirSync(batchDir(), { recursive: true });
  for (const f of ["ET1_a_Basic_ETSY.png", "ET2_b_Mirror_ETSY.TIF", "ON3_c.pdf", "PRINTED_101010-ETSY-DGEN.xml", "_batch_info.json", "notes.txt"]) {
    fs.writeFileSync(path.join(batchDir(), f), "x");
  }
  setDiagWorkstationResolver(() => "TEST-PC");
});

afterEach(() => {
  vi.restoreAllMocks();
  setDiagWorkstationResolver(null);
  try { fs.rmSync(h.storageRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("PRINTED readers - image tiles", () => {
  it("readPrintedDayNames lists the images and the PDF, nothing else", async () => {
    const res = await readPrintedDayNames(DAY);

    expect(res.success).toBe(true);
    expect(res.data.batches[0].files.map((f) => f.name).sort()).toEqual([
      "ET1_a_Basic_ETSY.png",
      "ET2_b_Mirror_ETSY.TIF",
      "ON3_c.pdf",
    ]);
  });

  it("readPrintedDay (BatchHistory) shows them as the batch's files", async () => {
    const res = await readPrintedDay(DAY);

    expect(res.success).toBe(true);
    const files = res.data.batches[0].files.map((f) => f.name).sort();
    expect(files).toEqual(["ET1_a_Basic_ETSY.png", "ET2_b_Mirror_ETSY.TIF", "ON3_c.pdf"]);
  });
});
