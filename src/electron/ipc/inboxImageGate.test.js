import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { FILE_STATUS } from "../../shared/constants.js";

// E3a-2 round 2 (S2 17:46, P1): the pipeline under the scan handles an image tile, but the INBOX does not
// show one yet - operators keep images in the inbox folders for their own manual printing, and listing them
// would put INVALID / Copying rows and a "N new files" count on every station. The ONE switch is
// helpers/inboxFile.js (E3b turns it on with the Etsy feature). Real files in a temp inbox, the REAL gate;
// only the parser and the database are stubbed. readFolders.image.test.js / peekInbox.image.test.js are the
// same paths with the switch on.

const h = vi.hoisted(() => ({ root: "" }));

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
import { peekInbox } from "./peekInbox.js";
import { recheckCopying } from "./recheckCopying.js";
import { inboxSkipsImage, inboxTakesImages } from "../helpers/inboxFile.js";
import { stabilityTracker } from "../helpers/pdfReadiness.js";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const png = Buffer.concat([PNG_SIG, Buffer.alloc(3000, 0x61), IEND]);
const tornPng = Buffer.concat([PNG_SIG, Buffer.alloc(100, 0x61), Buffer.alloc(4000, 0)]);
const tif = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(3000, 0x61)]);
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3000, 0x61), Buffer.from("\n%%EOF\n")]);

let folder;
beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-image-gate-"));
  folder = path.join(h.root, "GROUP");
  fs.mkdirSync(folder);
  stabilityTracker.retainOnly(new Set());
});
afterEach(() => fs.rmSync(h.root, { recursive: true, force: true }));

const fill = () => {
  fs.writeFileSync(path.join(folder, "a.pdf"), pdf);
  for (const [name, bytes] of [["b.png", png], ["c.png", tornPng], ["d.tif", tif], ["e.jpeg", png], ["F.PNG", png]]) {
    fs.writeFileSync(path.join(folder, name), bytes);
  }
};

describe("the inbox does not take images yet", () => {
  it("harness guard: the switch is off", () => {
    expect(inboxTakesImages()).toBe(false);
  });

  it("the gate names every image extension, without case, and no PDF or other file", () => {
    for (const n of ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.tif", "a.tiff", "A.PNG"]) expect(inboxSkipsImage(n)).toBe(true);
    for (const n of ["a.pdf", "a.PDF", "a", "a.xml", "a.txt", ".lock"]) expect(inboxSkipsImage(n)).toBe(false);
  });

  it("readFolders lists the PDF and leaves every image out - finished, torn or TIFF", async () => {
    fill();
    const res = await readFolders();
    expect(res.success).toBe(true);
    const rows = res.data.flatMap((g) => g.items);
    expect(rows.map((r) => r.id)).toEqual(["GROUP_a.pdf"]);
    expect(rows[0].status).toBe(FILE_STATUS.READY);
    expect(res.warnings).toEqual([]);
  });

  it("the tick has nothing to re-check for an image (it was never a COPYING row)", async () => {
    fill();
    await readFolders();
    expect(await recheckCopying()).toEqual({ success: true, updates: [] });
  });

  it("the inbox peek does not count an image as a new file", async () => {
    fill();
    expect(await peekInbox()).toEqual({ success: true, ids: ["GROUP_a.pdf"] });
  });
});
