import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

// ETAP 2e step 3 (S2's review of step 2): a printer the profile cannot route is refused in
// createBatch's VALIDATE stage, BEFORE any lock, copy or move - not only in createXML after
// the files have moved, where the same refusal costs a full rollback.
//
// The gate is getWorkflowFolderName from createXML.js - the SAME function createXML runs
// later, so the two checks cannot disagree. It is mocked here only to switch it between
// "routable" and "refused"; its own behaviour is pinned in hotfolderRouting.test.js.
// createBatchIds pulls fabricCache -> db.js, so it is stubbed; getRootPath points nowhere.

const h = vi.hoisted(() => ({ refuse: true, route: vi.fn() }));

vi.mock("./createXML.js", () => ({
  getWorkflowFolderName: (printer) => {
    h.route(printer);
    if (h.refuse) {
      throw Object.assign(new Error(`Printer "${printer}" has no valid hotfolder`), {
        code: "ERR_INVALID_PRINTER",
        stage: "validate",
        title: "Invalid printer",
      });
    }
    return "AUTOMATION_WORKFLOW_COTTON";
  },
}));
vi.mock("../helpers/createBatchIds.js", () => ({
  createBatchIds: () => ({ mainFolder: "24-09-2026", subFolder: "PRINTED_120000-G-DGEN" }),
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => "Z:\\nowhere" }));

import { createBatch } from "./createBatch.js";

const BATCH = [{ printer: "NOPE", file: { name: "a.pdf", fullPath: "Z:\\nowhere\\inbox\\a.pdf" } }];

let stat;
beforeEach(() => {
  h.refuse = true;
  h.route.mockClear();
  stat = vi.spyOn(fs.promises, "stat");
});
afterEach(() => vi.restoreAllMocks());

describe("createBatch - printer gate before anything moves", () => {
  it("refuses an unroutable printer at VALIDATE, without touching a single source file", async () => {
    const res = await createBatch(BATCH);

    expect(res.success).toBe(false);
    expect(res.errors[0]).toMatchObject({ code: "ERR_INVALID_PRINTER", stage: "validate" });
    expect(h.route).toHaveBeenCalledWith("NOPE");
    expect(stat).not.toHaveBeenCalled(); // the first file access of VALIDATE never ran
    expect(res.movedFiles).toEqual([]);
  });

  it("a routable printer passes the gate and validation goes on to the files", async () => {
    h.refuse = false;
    const res = await createBatch(BATCH);

    // the missing source file is what stops it now - one step further than the gate
    expect(stat).toHaveBeenCalled();
    expect(res.errors[0]).toMatchObject({ code: "ENOENT", stage: "validate" });
  });
});
