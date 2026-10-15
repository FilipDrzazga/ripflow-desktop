import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { PDF_STATE } from "../../shared/inboxReadiness.js";
import { checkPdf, createStabilityTracker, STABLE_MS, TAIL_BYTES } from "./pdfReadiness.js";

// Real files in a temp folder: the check is about bytes at the head and the tail of a file, and a
// fake fs would only test the fake. The clock of the stability tracker is injected.

let dir;
let clock;
let tracker;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-readiness-"));
  clock = 0;
  tracker = createStabilityTracker({ now: () => clock });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name, bytes) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
};
const body = (n) => Buffer.alloc(n, 0x61); // "a" - data that is neither zeros nor a marker
const complete = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), body(3000), Buffer.from("\n%%EOF\n")]);
const check = (p) => checkPdf(p, { tracker });

describe("checkPdf - a finished PDF", () => {
  it("a header and %%EOF at the end is READY", async () => {
    expect((await check(write("a.pdf", complete()))).state).toBe(PDF_STATE.READY);
  });

  it("%%EOF followed by a few trailing newlines/spaces is still READY (inside the last 1 KB)", async () => {
    const p = write("a.pdf", Buffer.concat([complete(), Buffer.from("\r\n".repeat(100))]));
    expect((await check(p)).state).toBe(PDF_STATE.READY);
  });

  it("a PDF smaller than the tail window is judged on the whole file", async () => {
    expect((await check(write("s.pdf", "%PDF-1.0\n%%EOF"))).state).toBe(PDF_STATE.READY);
  });

  it("%%EOF with more than 1 KB of data after it does NOT count (it is not 'at the end')", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n%%EOF\n"), body(TAIL_BYTES + 50)]));
    expect((await check(p)).state).toBe(PDF_STATE.COPYING); // no marker in the tail: the stability exit decides
  });
});

describe("checkPdf - a file still being written", () => {
  it("full size, good header, tail of zeros (a reserved copy) is COPYING", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(2000), Buffer.alloc(5000, 0)]));
    const v = await check(p);
    expect(v.state).toBe(PDF_STATE.COPYING);
    expect(v.reason).toMatch(/end of the file/);
  });

  it("a zero tail stays COPYING however long it has not changed - it never takes the stability exit", async () => {
    const p = write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(2000), Buffer.alloc(5000, 0)]));
    await check(p);
    clock += STABLE_MS * 10;
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
    expect(tracker.size()).toBe(0); // and it is not even watched
  });

  it("zeros where the header should be is COPYING (the data has not started)", async () => {
    expect((await check(write("a.pdf", Buffer.alloc(4000, 0)))).state).toBe(PDF_STATE.COPYING);
  });

  it("an empty file is COPYING", async () => {
    expect((await check(write("a.pdf", ""))).state).toBe(PDF_STATE.COPYING);
  });

  it("data up to the end but no %%EOF yet is COPYING, and watched", async () => {
    const v = await check(write("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), body(3000)])));
    expect(v).toMatchObject({ state: PDF_STATE.COPYING, tracked: true });
  });

  it("a file held open by the copying program (EBUSY / EPERM) is COPYING, not gone", async () => {
    for (const code of ["EBUSY", "EPERM"]) {
      const fsp = { open: async () => Promise.reject(Object.assign(new Error(code), { code })) };
      expect((await checkPdf("x.pdf", { tracker, fsp })).state).toBe(PDF_STATE.COPYING);
    }
  });
});

describe("checkPdf - the exit for a PDF with no %%EOF", () => {
  const noEof = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), body(3000)]);

  it("unchanged for STABLE_MS in the station's own looks -> READY_NO_EOF", async () => {
    const p = write("a.pdf", noEof());
    expect((await check(p)).state).toBe(PDF_STATE.COPYING); // first look
    clock += STABLE_MS - 1;
    expect((await check(p)).state).toBe(PDF_STATE.COPYING); // one ms short
    clock += 1;
    expect((await check(p)).state).toBe(PDF_STATE.READY_NO_EOF);
  });

  it("a change of size restarts the wait", async () => {
    const p = write("a.pdf", noEof());
    const fixed = new Date("2026-01-01T00:00:00Z");
    fs.utimesSync(p, fixed, fixed);
    await check(p);
    clock += STABLE_MS;
    fs.appendFileSync(p, body(10));
    fs.utimesSync(p, fixed, fixed); // the same mtime: only the size says the file moved
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
    clock += STABLE_MS - 1;
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
  });

  it("a change of mtime alone restarts the wait", async () => {
    const p = write("a.pdf", noEof());
    await check(p);
    clock += STABLE_MS;
    const later = new Date(Date.now() + 60000);
    fs.utimesSync(p, later, later);
    expect((await check(p)).state).toBe(PDF_STATE.COPYING);
  });

  it("measures the file's own mtime against nothing: a server clock far in the past or future changes nothing", async () => {
    const p = write("a.pdf", noEof());
    const old = new Date("2001-01-01");
    fs.utimesSync(p, old, old);
    await check(p);
    clock += STABLE_MS;
    expect((await check(p)).state).toBe(PDF_STATE.READY_NO_EOF);
  });

  it("a %%EOF that arrives later makes it READY and drops the watch", async () => {
    const p = write("a.pdf", noEof());
    await check(p);
    expect(tracker.size()).toBe(1);
    fs.appendFileSync(p, "\n%%EOF\n");
    expect((await check(p)).state).toBe(PDF_STATE.READY);
    expect(tracker.size()).toBe(0);
  });
});

describe("checkPdf - what is not listed", () => {
  it("a file that is not a PDF is NOT_PDF", async () => {
    expect((await check(write("a.pdf", "hello, this is text"))).state).toBe(PDF_STATE.NOT_PDF);
  });
  it("a file that is gone is GONE", async () => {
    expect((await check(path.join(dir, "missing.pdf"))).state).toBe(PDF_STATE.GONE);
  });
  it("EACCES stays NOT_PDF, as before; an unexpected error is thrown to the caller", async () => {
    const refuse = (code) => ({ open: async () => Promise.reject(Object.assign(new Error(code), { code })) });
    expect((await checkPdf("x.pdf", { tracker, fsp: refuse("EACCES") })).state).toBe(PDF_STATE.NOT_PDF);
    await expect(checkPdf("x.pdf", { tracker, fsp: refuse("EIO") })).rejects.toMatchObject({ code: "EIO" });
  });
});

describe("stability tracker", () => {
  it("retainOnly forgets the files the scan no longer saw", () => {
    tracker.observe("a", 1, 1);
    tracker.observe("b", 1, 1);
    tracker.retainOnly(new Set(["a"]));
    expect(tracker.size()).toBe(1);
    clock += 500;
    expect(tracker.observe("a", 1, 1)).toBe(500); // a kept its first-seen time
    expect(tracker.observe("b", 1, 1)).toBe(0); // b starts over
  });
});
