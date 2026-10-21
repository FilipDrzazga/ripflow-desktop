import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { checkPdf, createStabilityTracker, IMAGE_SETTLE_MS } from "./pdfReadiness.js";
import { PDF_STATE } from "../../shared/inboxReadiness.js";

// E3a-2: the ONE "is this inbox file finished" function also answers for an image tile (the Etsy route),
// chosen by the extension. Real files in a temp dir; the stability tracker has a clock the test moves.
// A finished image ends in its format's end marker; a copy that reserved its size and has not filled it
// ends in zeros; a TIFF has no marker, so it needs a second look that agrees.

let dir;
let clock;
let tracker;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "readiness-img-"));
  clock = 0;
  tracker = createStabilityTracker({ now: () => clock });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const body = (n = 2000) => Buffer.alloc(n, 0x61);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

const png = () => Buffer.concat([PNG_SIG, body(), IEND]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), body(), Buffer.from([0xff, 0xd9])]);
const gif = () => Buffer.concat([Buffer.from("GIF89a", "latin1"), body(), Buffer.from([0x3b])]);
const webp = () => {
  const data = Buffer.concat([Buffer.from("WEBPVP8 ", "latin1"), body()]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), size, data]);
};
const tif = () => Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), body()]);

const put = (name, bytes) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
};
const look = (p) => checkPdf(p, { tracker });

describe("an image with its end marker is READY", () => {
  it.each([
    ["a.png", png],
    ["a.jpg", jpg],
    ["a.jpeg", jpg],
    ["a.gif", gif],
    ["a.webp", webp],
  ])("%s", async (name, make) => {
    expect(await look(put(name, make()))).toEqual({ state: PDF_STATE.READY, tracked: true });
  });

  it("the extension is read without case", async () => {
    expect((await look(put("A.PNG", png()))).state).toBe(PDF_STATE.READY);
  });

  it("padding of zeros after the marker does not matter", async () => {
    expect((await look(put("a.png", Buffer.concat([png(), Buffer.alloc(300)])))).state).toBe(PDF_STATE.READY);
    expect((await look(put("b.jpg", Buffer.concat([jpg(), Buffer.alloc(300)])))).state).toBe(PDF_STATE.READY);
  });
});

describe("an image still being copied is COPYING, never READY", () => {
  it.each([
    ["a.png", png],
    ["a.jpg", jpg],
    ["a.gif", gif],
  ])("%s cut off before its end marker", async (name, make) => {
    const whole = make();
    const res = await look(put(name, whole.subarray(0, whole.length - 400)));
    expect(res.state).toBe(PDF_STATE.COPYING);
    expect(res.reason).toBeTruthy();
  });

  it.each([
    ["a.png", png],
    ["a.jpg", jpg],
    ["a.gif", gif],
    ["a.webp", webp],
  ])("%s with the size reserved and the end still zeros", async (name, make) => {
    const whole = make();
    const torn = Buffer.concat([whole.subarray(0, 300), Buffer.alloc(whole.length - 300)]);
    const res = await look(put(name, torn));
    expect(res.state).toBe(PDF_STATE.COPYING);
  });

  it("a WebP whose RIFF size is more than the file holds", async () => {
    const whole = webp();
    expect((await look(put("a.webp", whole.subarray(0, whole.length - 100)))).state).toBe(PDF_STATE.COPYING);
  });

  it("an empty file, and a head that is still zeros", async () => {
    expect((await look(put("a.png", Buffer.alloc(0)))).state).toBe(PDF_STATE.COPYING);
    expect((await look(put("b.png", Buffer.alloc(5000)))).state).toBe(PDF_STATE.COPYING);
  });

  it("a file that changed since this station's previous look", async () => {
    const p = put("a.png", png());
    expect((await look(p)).state).toBe(PDF_STATE.READY);
    fs.writeFileSync(p, Buffer.concat([png(), Buffer.alloc(64)]));
    const again = await look(p);
    expect(again.state).toBe(PDF_STATE.COPYING);
    expect(again.reason).toMatch(/changed/);
    expect((await look(p)).state).toBe(PDF_STATE.READY);
  });
});

describe("not an image of the kind its extension says", () => {
  it("is NOT_PDF (left out of the list), whatever the content", async () => {
    expect((await look(put("a.png", jpg()))).state).toBe(PDF_STATE.NOT_PDF);
    expect((await look(put("b.jpg", png()))).state).toBe(PDF_STATE.NOT_PDF);
    expect((await look(put("c.png", Buffer.from("%PDF-1.4\n%%EOF\n")))).state).toBe(PDF_STATE.NOT_PDF);
    expect((await look(put("d.gif", Buffer.from("not a picture at all")))).state).toBe(PDF_STATE.NOT_PDF);
  });

  it("a vanished file is GONE", async () => {
    expect((await look(path.join(dir, "gone.png"))).state).toBe(PDF_STATE.GONE);
  });
});

describe("a TIFF has no end marker: a second look has to agree", () => {
  it("the first look is COPYING, a later one that sees the same size and mtime is READY", async () => {
    const p = put("a.tif", tif());
    const first = await look(p);
    expect(first).toMatchObject({ state: PDF_STATE.COPYING, tracked: true });
    clock += IMAGE_SETTLE_MS;
    expect(await look(p)).toEqual({ state: PDF_STATE.READY, tracked: true });
  });

  it("a second look before the settle time is still COPYING", async () => {
    const p = put("a.tiff", tif());
    await look(p);
    clock += IMAGE_SETTLE_MS - 1;
    expect((await look(p)).state).toBe(PDF_STATE.COPYING);
  });

  it("a file that grew between the looks starts over", async () => {
    const p = put("a.tif", tif());
    await look(p);
    clock += IMAGE_SETTLE_MS;
    fs.appendFileSync(p, Buffer.alloc(100, 1));
    expect((await look(p)).state).toBe(PDF_STATE.COPYING);
  });

  it("a TIFF that ends in zeros is not mistaken for a torn copy", async () => {
    const p = put("a.tif", Buffer.concat([tif(), Buffer.alloc(4000)]));
    await look(p);
    clock += IMAGE_SETTLE_MS;
    expect((await look(p)).state).toBe(PDF_STATE.READY);
  });

  it("a TIFF with a wrong signature is NOT_PDF", async () => {
    expect((await look(put("a.tif", png()))).state).toBe(PDF_STATE.NOT_PDF);
  });
});
