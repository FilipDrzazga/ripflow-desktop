import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { FILE_STATUS } from "../../shared/constants.js";

// The inbox scan lists a PDF that is still being written as a COPYING row with the SAME id the
// finished file will have - it is not dropped (a dropped file would also be invisible to the inbox
// look's baseline, which treats a name that was around at load as "old" for good).

const h = vi.hoisted(() => ({ root: "" }));

vi.mock("../helpers/getRootPath.js", () => ({ getRootPath: () => h.root }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}) }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Cottons" }));
vi.mock("../helpers/getFileAgeInDays.js", () => ({ getFileAgeInDays: () => 0 }));
vi.mock("../helpers/db.js", () => ({ getOpenReprintRequestsByFileIds: () => [] }));
vi.mock("../helpers/parseFileName.js", () => ({
  parsePrintFileName: (name, { fullPath, dir }) => ({
    file: { name, ext: ".pdf", dir, fullPath },
    material: "x",
    status: name.startsWith("bad") ? "INVALID" : "READY",
    warnings: [],
    errors: [],
  }),
}));

import { readFolders } from "./readFolders.js";
import { recheckCopying } from "./recheckCopying.js";
import { stabilityTracker } from "../helpers/pdfReadiness.js";

const complete = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3000, 0x61), Buffer.from("\n%%EOF\n")]);
const torn = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100, 0x61), Buffer.alloc(4000, 0)]);

let folder;
beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "read-folders-copying-"));
  folder = path.join(h.root, "GROUP");
  fs.mkdirSync(folder);
  stabilityTracker.retainOnly(new Set());
});
afterEach(() => fs.rmSync(h.root, { recursive: true, force: true }));

const items = (res) => res.data.flatMap((g) => g.items);

describe("readFolders - files still being copied", () => {
  it("lists a torn copy as COPYING under the id the finished file will have", async () => {
    fs.writeFileSync(path.join(folder, "a.pdf"), complete);
    fs.writeFileSync(path.join(folder, "b.pdf"), torn);
    const res = await readFolders();

    expect(res.success).toBe(true);
    const byId = Object.fromEntries(items(res).map((i) => [i.id, i]));
    expect(byId["GROUP_a.pdf"].status).toBe(FILE_STATUS.READY);
    expect(byId["GROUP_b.pdf"]).toMatchObject({ status: FILE_STATUS.COPYING, statusParsed: FILE_STATUS.READY });
    expect(byId["GROUP_b.pdf"].copyingReason).toBeTruthy();
  });

  it("an INVALID name stays INVALID, copying or not", async () => {
    fs.writeFileSync(path.join(folder, "bad.pdf"), torn);
    expect(items(await readFolders())[0].status).toBe(FILE_STATUS.INVALID);
  });

  it("still leaves out what is not a PDF and what is empty", async () => {
    fs.writeFileSync(path.join(folder, "text.pdf"), "not a pdf at all");
    fs.writeFileSync(path.join(folder, "empty.pdf"), "");
    expect(items(await readFolders())).toEqual([]);
  });

  it("the tick flips a finished copy in place: same id, selectable, nothing else asked", async () => {
    const p = path.join(folder, "b.pdf");
    fs.writeFileSync(p, torn);
    await readFolders();
    expect(await recheckCopying()).toEqual({ success: true, updates: [] }); // still torn

    fs.writeFileSync(p, complete); // the copy finished
    expect(await recheckCopying()).toEqual({ success: true, updates: [{ id: "GROUP_b.pdf", state: "ready" }] });
  });
});
