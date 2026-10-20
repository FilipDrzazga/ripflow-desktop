import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { PDF_STATE } from "../../shared/inboxReadiness.js";
import { checkPdf, createStabilityTracker, STABLE_MS, ZERO_END_BYTES } from "./pdfReadiness.js";

// D39 + D40 (debt repayment 2026-10-20): the two edges of the readiness check that pdfReadiness.test.js does not reach.
// Real files again - the check is about bytes. The clock of the stability tracker is injected.

let dir;
let clock;
let tracker;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-readiness-growth-"));
  clock = 0;
  tracker = createStabilityTracker({ now: () => clock });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name, bytes) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
};
const body = (n) => Buffer.alloc(n, 0x61);
const check = (p) => checkPdf(p, { tracker });
const bump = (p, ms) => {
  const t = new Date(Date.now() + ms);
  fs.utimesSync(p, t, t);
};

describe("D39 - a copy cut off inside the data (data, then zeros, no %%EOF)", () => {
  it("is COPYING for good: the zero stretch at the end never takes the stability exit", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(900), Buffer.alloc(ZERO_END_BYTES, 0)]));
    const first = await check(p);
    expect(first.state).toBe(PDF_STATE.COPYING);
    expect(first.reason).toMatch(/end of the file/);
    clock += STABLE_MS * 10;
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
    expect(tracker.size()).toBe(0); // not even watched, like the all-zero tail
  });

  it("data that ends in 63 zero bytes is not a torn copy: the stability exit still applies", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(900), Buffer.alloc(ZERO_END_BYTES - 1, 0), Buffer.from("x")]));
    expect(await check(p)).toMatchObject({ state: PDF_STATE.COPYING, tracked: true });
    clock += STABLE_MS;
    expect((await check(p)).state).toBe(PDF_STATE.READY_NO_EOF);
  });

  it("a %%EOF before the zero stretch is still READY (padding after the marker)", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(900), Buffer.from("\n%%EOF\n"), Buffer.alloc(300, 0)]));
    expect((await check(p)).state).toBe(PDF_STATE.READY);
  });
});

describe("D40 - a file that ends in %%EOF but changed since the previous look", () => {
  const done = (n) => Buffer.concat([Buffer.from("%PDF-1.4\n"), body(n), Buffer.from("\n%%EOF\n")]);

  it("the first look is READY and is watched; the same file at the next look is READY again", async () => {
    const p = write("a.pdf", done(2000));
    expect(await check(p)).toMatchObject({ state: PDF_STATE.READY, tracked: true });
    expect((await check(p)).state).toBe(PDF_STATE.READY);
  });

  it("a size that grew between two looks is COPYING until two looks agree", async () => {
    const p = write("a.pdf", done(2000));
    expect((await check(p)).state).toBe(PDF_STATE.READY);
    fs.appendFileSync(p, done(500));
    const grown = await check(p);
    expect(grown).toMatchObject({ state: PDF_STATE.COPYING, tracked: true });
    expect(grown.reason).toMatch(/changed since/);
    expect((await check(p)).state).toBe(PDF_STATE.READY);
  });

  it("a new mtime at the same size counts as a change", async () => {
    const p = write("a.pdf", done(2000));
    expect((await check(p)).state).toBe(PDF_STATE.READY);
    bump(p, 60000);
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
    expect((await check(p)).state).toBe(PDF_STATE.READY);
  });

  it("retainOnly forgets the last look of a file the scan no longer saw", async () => {
    const p = write("a.pdf", done(2000));
    expect((await check(p)).state).toBe(PDF_STATE.READY);
    tracker.retainOnly(new Set());
    fs.appendFileSync(p, done(500));
    expect((await check(p)).state).toBe(PDF_STATE.READY); // a first look again, no memory of the old size
  });

  it("the watch of the no-EOF wait is a separate count: a finished file does not show in size()", async () => {
    await check(write("a.pdf", done(2000)));
    expect(tracker.size()).toBe(0);
  });
});
