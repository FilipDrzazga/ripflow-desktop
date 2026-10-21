import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";

// E3a-2: an image tile (the Etsy route) travels through createBatch like a PDF but is copied WHOLE: byte
// for byte, no first-page cut, the source removed after the commit, a half-copied one refused at
// VALIDATE. Real files in a temp storage root; the printer route and the batch ids are stubbed (the
// pattern of createBatchCopyingGate.test.js).

const h = vi.hoisted(() => ({ root: "" }));

vi.mock("./createXML.js", () => ({ getWorkflowFolderName: () => "AUTOMATION_WORKFLOW_COTTON" }));
vi.mock("../helpers/createBatchIds.js", () => ({
  createBatchIds: () => ({ mainFolder: "24-09-2026", subFolder: "PRINTED_120000-G-DGEN" }),
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.root }));

import { createBatch } from "./createBatch.js";
import { stabilityTracker } from "../helpers/pdfReadiness.js";

let inbox;
beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "create-batch-image-"));
  inbox = path.join(h.root, "GROUP");
  fs.mkdirSync(inbox);
  stabilityTracker.retainOnly(new Set());
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const png = () => Buffer.concat([PNG_SIG, Buffer.from("tile-data".repeat(500)), IEND]);

const twoPagePdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
};
const put = (name, bytes) => {
  const p = path.join(inbox, name);
  fs.writeFileSync(p, bytes);
  return p;
};
const item = (p) => ({ printer: "DGEN", file: { name: path.basename(p), fullPath: p } });
const printedDir = () => path.join(h.root, "PRINTED", "24-09-2026", "PRINTED_120000-G-DGEN");

describe("createBatch with an image tile", () => {
  it("copies it byte for byte into PRINTED and removes the source", async () => {
    const bytes = png();
    const p = put("ET1_a_Basic_ETSY.png", bytes);
    const res = await createBatch([item(p)]);

    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
    expect(res.movedFiles).toEqual([p]);
    expect(fs.existsSync(p)).toBe(false);
    expect(fs.readFileSync(path.join(printedDir(), "ET1_a_Basic_ETSY.png")).equals(bytes)).toBe(true);
  });

  it("a PDF in the same batch is still cut to its first page, the image is not touched by that", async () => {
    const bytes = png();
    const img = put("ET1_a_Basic_ETSY.png", bytes);
    const pdf = put("ON2_b.pdf", await twoPagePdf());
    const res = await createBatch([item(img), item(pdf)]);

    expect(res.success).toBe(true);
    expect(fs.readFileSync(path.join(printedDir(), "ET1_a_Basic_ETSY.png")).equals(bytes)).toBe(true);
    const copied = await PDFDocument.load(fs.readFileSync(path.join(printedDir(), "ON2_b.pdf")));
    expect(copied.getPageCount()).toBe(1);
  });

  it("a half-copied image is refused at VALIDATE: nothing locked, created or moved", async () => {
    const whole = png();
    const p = put("ET1_a_Basic_ETSY.png", whole.subarray(0, whole.length - 500));
    const res = await createBatch([item(p)]);

    expect(res.success).toBe(false);
    expect(res.errors[0]).toMatchObject({ code: "ERR_FILE_COPYING", stage: "validate" });
    expect(res.errors[0].message).toContain("ET1_a_Basic_ETSY.png");
    expect(fs.existsSync(path.join(inbox, ".lock"))).toBe(false);
    expect(fs.existsSync(path.join(h.root, "PRINTED"))).toBe(false);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("a file already at the destination is never overwritten (COPYFILE_EXCL)", async () => {
    const p = put("ET1_a_Basic_ETSY.png", png());
    const copyFile = vi.spyOn(fs.promises, "copyFile");
    await createBatch([item(p)]);
    expect(copyFile).toHaveBeenCalledTimes(1);
    expect(copyFile.mock.calls[0][2]).toBe(fs.constants.COPYFILE_EXCL);
  });

  it("a copy that comes out shorter than the source fails the batch and leaves the source in place", async () => {
    const bytes = png();
    const p = put("ET1_a_Basic_ETSY.png", bytes);
    const realStat = fs.promises.stat.bind(fs.promises);
    vi.spyOn(fs.promises, "stat").mockImplementation(async (target, ...rest) => {
      const st = await realStat(target, ...rest);
      // the temp copy reports fewer bytes than the source holds
      if (String(target).includes(".tmp-")) return Object.assign(Object.create(Object.getPrototypeOf(st)), st, { size: st.size - 1 });
      return st;
    });
    const res = await createBatch([item(p)]);

    expect(res.success).toBe(false);
    expect(res.errors[0].message).toContain("Failed to copy file ET1_a_Basic_ETSY.png");
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.existsSync(printedDir())).toBe(false);
  });
});
