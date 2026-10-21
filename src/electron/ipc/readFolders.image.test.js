import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { performance } from "node:perf_hooks";
import { FILE_STATUS } from "../../shared/constants.js";

// E3a-2: the inbox scan lists an image tile (the Etsy route) the way it lists a PDF - a finished one
// READY, one still being written as a COPYING row under the id it will keep, a file that is not what its
// extension says left out - and the tick flips a TIFF (no end marker) once a second look agrees. The
// parser is stubbed (the name -> columns part is parseFileName.tile.test.js).

const h = vi.hoisted(() => ({ root: "" }));

// the inbox does not take images yet (helpers/inboxFile.js, inboxImageGate.test.js); this file is the
// pipeline UNDER the scan, with the E3b switch on
vi.mock("../helpers/inboxFile.js", () => ({ inboxSkipsImage: () => false }));
vi.mock("../helpers/getRootPath.js", () => ({ getRootPath: () => h.root }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}) }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Cottons" }));
vi.mock("../helpers/getFileAgeInDays.js", () => ({ getFileAgeInDays: () => 0 }));
vi.mock("../helpers/db.js", () => ({ getOpenReprintRequestsByFileIds: () => [] }));
vi.mock("../helpers/parseFileName.js", () => ({
  parsePrintFileName: (name, { fullPath, dir }) => ({
    file: { name, ext: path.extname(name).slice(1), dir, fullPath },
    material: "x",
    status: "READY",
    warnings: [],
    errors: [],
  }),
}));

import { readFolders } from "./readFolders.js";
import { recheckCopying } from "./recheckCopying.js";
import { stabilityTracker, IMAGE_SETTLE_MS } from "../helpers/pdfReadiness.js";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const png = Buffer.concat([PNG_SIG, Buffer.alloc(3000, 0x61), IEND]);
const tornPng = Buffer.concat([PNG_SIG, Buffer.alloc(100, 0x61), Buffer.alloc(4000, 0)]);
const tif = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(3000, 0x61)]);

let folder;
beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "read-folders-image-"));
  folder = path.join(h.root, "GROUP");
  fs.mkdirSync(folder);
  stabilityTracker.retainOnly(new Set());
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

const items = (res) => res.data.flatMap((g) => g.items);
const byId = (res) => Object.fromEntries(items(res).map((i) => [i.id, i]));

describe("readFolders - image tiles", () => {
  it("lists a finished image READY and a torn copy as COPYING under the same id", async () => {
    fs.writeFileSync(path.join(folder, "a.png"), png);
    fs.writeFileSync(path.join(folder, "b.png"), tornPng);
    const rows = byId(await readFolders());

    expect(rows["GROUP_a.png"].status).toBe(FILE_STATUS.READY);
    expect(rows["GROUP_b.png"]).toMatchObject({ status: FILE_STATUS.COPYING, statusParsed: FILE_STATUS.READY });
    expect(rows["GROUP_b.png"].copyingReason).toBeTruthy();
  });

  it("leaves out an image that is not one (wrong content) and an empty one", async () => {
    fs.writeFileSync(path.join(folder, "text.png"), "not a picture at all");
    fs.writeFileSync(path.join(folder, "empty.png"), "");
    expect(items(await readFolders())).toEqual([]);
  });

  it("a PDF and an image side by side are both listed", async () => {
    fs.writeFileSync(path.join(folder, "a.png"), png);
    fs.writeFileSync(
      path.join(folder, "b.pdf"),
      Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3000, 0x61), Buffer.from("\n%%EOF\n")]),
    );
    expect(Object.keys(byId(await readFolders())).sort()).toEqual(["GROUP_a.png", "GROUP_b.pdf"]);
  });

  it("a TIFF is COPYING on the first scan and the tick flips it once a second look agrees", async () => {
    const t0 = performance.now();
    const now = vi.spyOn(performance, "now").mockReturnValue(t0);
    fs.writeFileSync(path.join(folder, "t.tif"), tif);
    expect(byId(await readFolders())["GROUP_t.tif"].status).toBe(FILE_STATUS.COPYING);
    expect(await recheckCopying()).toEqual({ success: true, updates: [] });

    now.mockReturnValue(t0 + IMAGE_SETTLE_MS);
    expect(await recheckCopying()).toEqual({ success: true, updates: [{ id: "GROUP_t.tif", state: "ready" }] });
  });
});
