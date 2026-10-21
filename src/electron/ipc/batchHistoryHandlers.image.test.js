import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// E3a-2: rolling back (a batch, one file) and deleting a batch treat an image tile (the Etsy route) like a
// PDF: it goes back to its inbox folder WHOLE and untouched, its stage row is cleared, the snapshot names
// it, and a batch that still holds one is not "empty". Real files in a temp storage root; everything that
// would load the database, electron-store or the XML builder is stubbed (the pattern of
// batchHistoryHandlers.rollback.test.js).

const h = vi.hoisted(() => ({
  storageRoot: "",
  clearFileStage: vi.fn(),
  resolveRipErrorsByFile: vi.fn(),
}));

vi.mock("electron", () => ({}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/validateStoragePath.js", () => ({ assertStorageFilePath: async (p) => p }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ workstationName: "TEST-PC" }) }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));
vi.mock("./createXML.js", () => ({ submitBatchToPrintFactory: vi.fn() }));
vi.mock("../helpers/db.js", () => ({
  clearFileStage: (...a) => h.clearFileStage(...a),
  resolveRipErrorsByFile: (...a) => h.resolveRipErrorsByFile(...a),
  insertRollbackReason: vi.fn(),
  insertReprintRequest: vi.fn(),
  getOpenReprintRequestsByFileIds: () => [],
}));

import { rollbackBatchFromHistory, rollbackFileFromHistory, deleteBatchFolder } from "./batchHistoryHandlers.js";

const BATCH_NAME = "PRINTED_120000-TESTGROUP-DGEN"; // must match BATCH_FOLDER_RE
const GROUP = "TESTGROUP";
// a DPI-like dot inside the stem: the stem is the name minus the LAST extension only
const IMAGE = "ET1_a_Basic_211.67_ETSY.png";
const IMAGE_STEM = "ET1_a_Basic_211.67_ETSY";
const bytes = Buffer.from("image bytes that must come back untouched");

let batchDir;
let destDir;
beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bh-image-"));
  batchDir = path.join(h.storageRoot, "PRINTED", "01-01-2026", BATCH_NAME);
  destDir = path.join(h.storageRoot, GROUP);
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, IMAGE), bytes);
  h.clearFileStage.mockClear();
  h.resolveRipErrorsByFile.mockClear();
});
afterEach(() => fs.rmSync(h.storageRoot, { recursive: true, force: true }));

describe("batch history with an image tile", () => {
  it("a batch rollback returns the image whole, clears its stage and names it in the snapshot", async () => {
    fs.writeFileSync(path.join(batchDir, "ON2_b.pdf"), "pdf");
    const res = await rollbackBatchFromHistory({ batchPath: batchDir });

    expect(res.success).toBe(true);
    expect(fs.readFileSync(path.join(destDir, IMAGE)).equals(bytes)).toBe(true);
    expect(fs.existsSync(path.join(batchDir, IMAGE))).toBe(false);
    expect(h.clearFileStage).toHaveBeenCalledWith(IMAGE_STEM);
    expect(h.clearFileStage).toHaveBeenCalledWith("ON2_b");
    const snapshot = JSON.parse(fs.readFileSync(path.join(batchDir, "_rollback_snapshot.json"), "utf8"));
    expect(snapshot.files).toContain(IMAGE);
  });

  it("a batch rollback never overwrites an image already waiting in the inbox", async () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, IMAGE), "the original that is already there");
    const res = await rollbackBatchFromHistory({ batchPath: batchDir });

    expect(res.success).toBe(false);
    expect(fs.readFileSync(path.join(destDir, IMAGE), "utf8")).toBe("the original that is already there");
    expect(fs.readFileSync(path.join(batchDir, IMAGE)).equals(bytes)).toBe(true);
    expect(h.clearFileStage).not.toHaveBeenCalled();
  });

  it("a single-file rollback of an image clears the stage by the stem", async () => {
    const res = await rollbackFileFromHistory({ filePath: path.join(batchDir, IMAGE), batchPath: batchDir });

    expect(res.success).toBe(true);
    expect(fs.readFileSync(path.join(destDir, IMAGE)).equals(bytes)).toBe(true);
    expect(h.clearFileStage).toHaveBeenCalledWith(IMAGE_STEM);
  });

  it("a batch that still holds an image is not deleted", async () => {
    const res = await deleteBatchFolder(batchDir);

    expect(res.success).toBe(false);
    expect(res.errors[0].message).toMatch(/still contains/);
    expect(fs.existsSync(batchDir)).toBe(true);
  });

  it("an emptied batch can be deleted", async () => {
    fs.rmSync(path.join(batchDir, IMAGE));
    expect((await deleteBatchFolder(batchDir)).success).toBe(true);
    expect(fs.existsSync(batchDir)).toBe(false);
  });
});
