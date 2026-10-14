import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// 2026-10-14: a whole-batch PrintFactory failure is read as one row per file (scope BATCH), and
// resolved per job from the UI. Pinned here: the scan leaves a job that the DB already holds under
// OTHER files (read before, the old way), it completes one cut short, and the two manual resolves
// each reach their own DB function. The DB, the parser and the profile are mocked; the folder is a
// real temp dir.
let storageRoot = "";
let parsed = [];
let otherFiles = false;
const inserted = [];
const askedJobs = [];
const resolvedByFile = [];
const resolvedByJob = [];
let writeOk = true;
const handlers = {};

vi.mock("electron", () => ({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } } }));
vi.mock("../helpers/db.js", () => ({
  insertRipError: (row) => inserted.push(row),
  getOpenRipErrors: () => [],
  ripErrorJobHasOtherFiles: (jobGuid, fileIds) => {
    askedJobs.push({ jobGuid, fileIds });
    return otherFiles;
  },
  resolveRipErrorsByFile: (fileId) => { resolvedByFile.push(fileId); return writeOk; },
  resolveRipErrorsByJob: (jobGuid) => { resolvedByJob.push(jobGuid); return writeOk; },
}));
vi.mock("../helpers/shopProfile.js", () => ({ getFolder: () => "ERRORS" }));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => storageRoot }));
vi.mock("../helpers/parseRipErrorXml.js", () => ({ parseRipErrorXml: () => parsed }));

import { scanRipErrors, registerRipErrorHandlers } from "./ripErrorHandlers.js";

registerRipErrorHandlers();

const batchRows = [
  { jobGuid: "job-1", fileId: "ON1_a", scope: "batch" },
  { jobGuid: "job-1", fileId: "ON2_b", scope: "batch" },
  { jobGuid: "job-1", fileId: "ON3_c", scope: "batch" },
];

beforeEach(() => {
  storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rip-job-"));
  fs.mkdirSync(path.join(storageRoot, "ERRORS"));
  fs.writeFileSync(path.join(storageRoot, "ERRORS", "batch.xml"), "<Job/>");
  parsed = batchRows;
  otherFiles = false;
  writeOk = true;
  for (const list of [inserted, askedJobs, resolvedByFile, resolvedByJob]) list.length = 0;
});
afterEach(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("scanRipErrors - one xml is one job", () => {
  it("a new job: every row inserted, with ONE detection time, after asking about exactly its files", async () => {
    await scanRipErrors();
    expect(askedJobs).toEqual([{ jobGuid: "job-1", fileIds: ["ON1_a", "ON2_b", "ON3_c"] }]);
    expect(inserted.map((r) => [r.fileId, r.scope])).toEqual([
      ["ON1_a", "batch"],
      ["ON2_b", "batch"],
      ["ON3_c", "batch"],
    ]);
    expect(new Set(inserted.map((r) => r.detectedAt)).size).toBe(1);
  });

  it("a job the DB holds under other files (read the old way, maybe resolved) -> nothing inserted", async () => {
    otherFiles = true;
    await scanRipErrors();
    expect(inserted).toEqual([]);
  });

  it("rows without a key are dropped before the question, and no question for an xml without rows", async () => {
    parsed = [{ jobGuid: "job-1", fileId: null }, ...batchRows.slice(0, 1)];
    await scanRipErrors();
    expect(askedJobs).toEqual([{ jobGuid: "job-1", fileIds: ["ON1_a"] }]);
    parsed = [];
    askedJobs.length = 0;
    await scanRipErrors();
    expect(askedJobs).toEqual([]);
  });
});

describe("manual resolve - file or whole job", () => {
  it("rip-errors:resolveJob resolves by job, never by file", async () => {
    expect(await handlers["rip-errors:resolveJob"]({}, "job-1")).toEqual({ success: true });
    expect(resolvedByJob).toEqual(["job-1"]);
    expect(resolvedByFile).toEqual([]);
  });

  it("rip-errors:resolve still resolves by file", async () => {
    expect(await handlers["rip-errors:resolve"]({}, "ON1_a")).toEqual({ success: true });
    expect(resolvedByFile).toEqual(["ON1_a"]);
    expect(resolvedByJob).toEqual([]);
  });

  it("a failed write is a failure (the badge must stay), not a success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeOk = false;
    const res = await handlers["rip-errors:resolveJob"]({}, "job-1");
    expect(res.success).toBe(false);
    expect(res.error.code).toBe("DB_WRITE_FAILED");
  });

  it("no job id -> refused before the DB", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handlers["rip-errors:resolveJob"]({}, "  ");
    expect(res.success).toBe(false);
    expect(res.error.code).toBe("INVALID_JOB_GUID");
    expect(resolvedByJob).toEqual([]);
  });
});
