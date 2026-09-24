import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 2d-3: scanRipErrors reads the folder named by the shop profile (folders.ripError).
// Edges mocked: electron (ipcMain), the DB, the profile lookup, the storage root and the XML
// parser (its own suite pins the shapes); the folder itself is a real temp dir.
let storageRoot = "";
let folder = null;
const inserted = [];
const OPEN = [{ file_id: "open-from-db" }];

vi.mock("electron", () => ({ ipcMain: { handle: () => {} } }));
vi.mock("../helpers/db.js", () => ({
  insertRipError: (row) => inserted.push(row),
  getOpenRipErrors: () => OPEN,
  resolveRipErrorsByFile: () => true,
}));
vi.mock("../helpers/shopProfile.js", () => ({ getFolder: (name) => (name === "ripError" ? folder : null) }));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => storageRoot }));
vi.mock("../helpers/parseRipErrorXml.js", () => ({
  parseRipErrorXml: (xml) => [{ jobGuid: "g-" + xml.trim(), fileId: "f-" + xml.trim() }],
}));

import { scanRipErrors } from "./ripErrorHandlers.js";

const put = (dir, name, content) => {
  fs.mkdirSync(path.join(storageRoot, dir), { recursive: true });
  fs.writeFileSync(path.join(storageRoot, dir, name), content);
};

beforeEach(() => {
  storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rip-scan-"));
  inserted.length = 0;
  folder = null;
});
afterEach(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("scanRipErrors - folder from the shop profile (ETAP 2d-3)", () => {
  it("reads the xml files of the folder the profile names, not a hardcoded one", async () => {
    folder = "PF_ERRORS";
    put("PF_ERRORS", "a.xml", "one");
    put("PF_ERRORS", "a.tif", "ignored");
    put("AUTOMATION_WORKFLOW_ERROR", "old.xml", "legacy");
    const res = await scanRipErrors();
    expect(res).toEqual({ success: true, data: OPEN });
    expect(inserted.map((r) => r.fileId)).toEqual(["f-one"]);
  });

  it("Alex's name works exactly as before", async () => {
    folder = "AUTOMATION_WORKFLOW_ERROR";
    put("AUTOMATION_WORKFLOW_ERROR", "x.xml", "two");
    await scanRipErrors();
    expect(inserted.map((r) => r.fileId)).toEqual(["f-two"]);
  });

  it("no folder in the profile -> nothing read, the open errors from the DB returned (badges stay)", async () => {
    folder = null;
    put("AUTOMATION_WORKFLOW_ERROR", "x.xml", "three");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await scanRipErrors();
    expect(res).toEqual({ success: true, data: OPEN });
    expect(inserted).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("the skip is logged once, not on every 30 s poll", async () => {
    folder = null;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await scanRipErrors();
    await scanRipErrors();
    await scanRipErrors();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("the named folder not created yet (ENOENT) -> same answer as before 2d-3", async () => {
    folder = "PF_ERRORS";
    const res = await scanRipErrors();
    expect(res).toEqual({ success: true, data: OPEN });
    expect(inserted).toEqual([]);
  });
});
