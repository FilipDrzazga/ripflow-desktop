import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";

// A source PDF still being written is refused in createBatch's VALIDATE stage - before the lock,
// the destination folder, any copy - by the SAME function the inbox scan lists "Copying..." with
// (helpers/pdfReadiness.js). Real files in a temp storage root; only the printer route and the
// batch ids are stubbed (as in createBatchPrinterGate.test.js).

const h = vi.hoisted(() => ({ root: "" }));

vi.mock("./createXML.js", () => ({ getWorkflowFolderName: () => "AUTOMATION_WORKFLOW_COTTON" }));
vi.mock("../helpers/createBatchIds.js", () => ({
  createBatchIds: () => ({ mainFolder: "24-09-2026", subFolder: "PRINTED_120000-G-DGEN" }),
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.root }));

import { createBatch } from "./createBatch.js";
import { stabilityTracker, STABLE_MS } from "../helpers/pdfReadiness.js";

let inbox;
beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "create-batch-copying-"));
  inbox = path.join(h.root, "GROUP");
  fs.mkdirSync(inbox);
  stabilityTracker.retainOnly(new Set());
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

const readyPdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  return Buffer.from(await doc.save());
};
const put = (name, bytes) => {
  const p = path.join(inbox, name);
  fs.writeFileSync(p, bytes);
  return p;
};
// the reserved-size copy: a good header, data at the front, the end still zeros
const tornCopy = async () => {
  const good = await readyPdf();
  return Buffer.concat([good.subarray(0, 200), Buffer.alloc(good.length - 200 + 2000, 0)]);
};
const item = (p) => ({ printer: "DGEN", file: { name: path.basename(p), fullPath: p } });

describe("createBatch - a file still being copied is refused before anything moves", () => {
  it("refuses a zero-tailed file at VALIDATE: no lock, no PRINTED folder, the source untouched", async () => {
    const p = put("a.pdf", await tornCopy());
    const before = fs.readFileSync(p);
    const res = await createBatch([item(p)]);

    expect(res.success).toBe(false);
    expect(res.errors[0]).toMatchObject({ code: "ERR_FILE_COPYING", stage: "validate" });
    expect(res.errors[0].message).toContain("a.pdf");
    expect(res.movedFiles).toEqual([]);
    expect(fs.existsSync(path.join(inbox, ".lock"))).toBe(false);
    expect(fs.existsSync(path.join(h.root, "PRINTED"))).toBe(false);
    expect(fs.readFileSync(p).equals(before)).toBe(true);
  });

  it("one unfinished file refuses the whole batch and names it; the finished one is not moved", async () => {
    const ok = put("ok.pdf", await readyPdf());
    const torn = put("torn.pdf", await tornCopy());
    const res = await createBatch([item(ok), item(torn)]);

    expect(res.errors[0]).toMatchObject({ code: "ERR_FILE_COPYING" });
    expect(res.errors[0].message).toContain("torn.pdf");
    expect(res.errors[0].message).not.toContain("ok.pdf");
    expect(fs.existsSync(ok)).toBe(true);
    expect(fs.existsSync(path.join(h.root, "PRINTED"))).toBe(false);
  });

  it("a file with a header and no %%EOF yet is refused too, until it has stayed unchanged long enough", async () => {
    const p = put("a.pdf", Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3000, 0x61)]));
    const res = await createBatch([item(p)]);
    expect(res.errors[0]).toMatchObject({ code: "ERR_FILE_COPYING" });
  });

  it("after the stability exit the same file goes ahead, with a warning that names it", async () => {
    // a loadable PDF whose end marker is spelled wrong: a generator that writes no %%EOF
    const noEofPdf = Buffer.from((await readyPdf()).toString("latin1").replace("%%EOF", "%%EOX"), "latin1");
    const p = put("a.pdf", noEofPdf);

    const t0 = performance.now();
    const now = vi.spyOn(performance, "now").mockReturnValue(t0);
    const first = await createBatch([item(p)]);
    expect(first.errors[0]).toMatchObject({ code: "ERR_FILE_COPYING" });

    now.mockReturnValue(t0 + STABLE_MS);
    const second = await createBatch([item(p)]);
    expect(second.errors.map((e) => e.code)).not.toContain("ERR_FILE_COPYING");
    expect(second.warnings.join("\n")).toContain("a.pdf");
    expect(second.warnings.join("\n")).toContain("%%EOF");
  });

  it("a finished PDF passes the gate and is moved as before", async () => {
    const p = put("a.pdf", await readyPdf());
    const res = await createBatch([item(p)]);

    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
    expect(res.warnings).toEqual([]);
    expect(fs.existsSync(p)).toBe(false);
  });
});
