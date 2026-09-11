import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Proves the thing that was missing on 2026-09-10: that a REAL error object from
// fs.promises.rename reaches result.failedFiles with its raw OS fields (code/errno/
// syscall) and the src/dest paths - the fields the operator message and the log need.
//
// WHAT IS REAL: fs (a genuine os.tmpdir batch folder with two .pdf files), path,
// parseBatchFolderName (imported unmocked from readPrintedFolder.js, so the batch folder
// name really has to match BATCH_FOLDER_RE), and rollbackFailure.js (pure).
// WHAT IS A STUB: everything that would drag in better-sqlite3 / electron-store / the XML
// builder - db.js, getSettings, shopProfile, getMaterialType, fabricCache, createXML,
// electron - none of which the no-reason rollback path exercises. getRootPath returns the
// per-test temp root; validateStoragePath passes the path straight through.
//
// The rename spy fails by FILENAME (not call order), because readdir order is not
// guaranteed and the test must be deterministic.

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

import { rollbackBatchFromHistory } from "./batchHistoryHandlers.js";
import { describeRollbackFailure } from "../helpers/rollbackFailure.js";

const BATCH_NAME = "PRINTED_120000-TESTGROUP-DGEN"; // must match BATCH_FOLDER_RE
const GROUP = "TESTGROUP";

const realRename = fs.promises.rename.bind(fs.promises);
const makeEnoent = (file) =>
  Object.assign(new Error(`ENOENT: no such file or directory, rename '${file}'`), {
    code: "ENOENT",
    errno: -4058,
    syscall: "rename",
  });

let batchDir;
let destDir;

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-rb-"));
  batchDir = path.join(h.storageRoot, "PRINTED", "01-01-2026", BATCH_NAME);
  destDir = path.join(h.storageRoot, GROUP);
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, "ok.pdf"), "ok");
  fs.writeFileSync(path.join(batchDir, "fail.pdf"), "fail");
  h.clearFileStage.mockClear();
  h.resolveRipErrorsByFile.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(h.storageRoot, { recursive: true, force: true });
  } catch {
    // best-effort temp cleanup
  }
});

describe("rollbackBatchFromHistory - real rename failure lands in failedFiles", () => {
  it("one file fails: its raw OS fields and paths are captured; the other is reconciled", async () => {
    vi.spyOn(fs.promises, "rename").mockImplementation(async (src, dest) => {
      if (String(src).endsWith("fail.pdf")) throw makeEnoent(src);
      return realRename(src, dest);
    });

    const result = await rollbackBatchFromHistory({ batchPath: batchDir });

    expect(result.success).toBe(false);
    expect(result.restoredFiles).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.failedFiles).toHaveLength(1);

    const f = result.failedFiles[0];
    expect(f.name).toBe("fail.pdf");
    expect(f.src).toBe(path.join(batchDir, "fail.pdf"));
    expect(f.dest).toBe(path.join(destDir, "fail.pdf"));
    expect(f.code).toBe("ENOENT");
    expect(f.errno).toBe(-4058);
    expect(f.syscall).toBe("rename");
    expect(typeof f.message).toBe("string");

    // DB reconciled once, for the file that actually moved.
    expect(h.clearFileStage).toHaveBeenCalledTimes(1);
    expect(h.clearFileStage).toHaveBeenCalledWith("ok");
    expect(h.resolveRipErrorsByFile).toHaveBeenCalledTimes(1);

    // The moved file physically left the batch folder.
    expect(fs.existsSync(path.join(destDir, "ok.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(batchDir, "ok.pdf"))).toBe(false);
  });

  it("all files fail: nothing restored, every failure captured, DB untouched", async () => {
    vi.spyOn(fs.promises, "rename").mockImplementation(async (src) => {
      throw makeEnoent(src);
    });

    const result = await rollbackBatchFromHistory({ batchPath: batchDir });

    expect(result.success).toBe(false);
    expect(result.restoredFiles).toEqual([]);
    expect(result.failedFiles).toHaveLength(2);
    expect(result.failedFiles.every((f) => f.code === "ENOENT" && f.syscall === "rename")).toBe(true);
    expect(h.clearFileStage).not.toHaveBeenCalled();
  });

  it("the captured failure feeds a human message that names the file and the OS cause", async () => {
    vi.spyOn(fs.promises, "rename").mockImplementation(async (src, dest) => {
      if (String(src).endsWith("fail.pdf")) throw makeEnoent(src);
      return realRename(src, dest);
    });

    const result = await rollbackBatchFromHistory({ batchPath: batchDir });
    const described = describeRollbackFailure(result.failedFiles);

    expect(described.code).toBe("ERR_ROLLBACK_FAILED");
    expect(described.message).toContain("fail.pdf");
    expect(described.message).toContain("ENOENT on rename");
  });
});
