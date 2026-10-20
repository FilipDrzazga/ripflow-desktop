import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// The Ctrl+F history search reads one PRINTED day as bare PDF names (readPrintedDayNames): two readdir
// levels and nothing else. Same harness as readPrintedFolder.visibility.test.js - a genuine os.tmpdir
// tree and the real reader, db.js / getRootPath / shopProfile stubbed.

const h = vi.hoisted(() => ({ storageRoot: "", insertLog: vi.fn() }));

vi.mock("../helpers/db.js", () => ({
  insertLog: (...a) => h.insertLog(...a),
  getDbDegraded: () => false,
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => null }));
vi.mock("../helpers/getMaterialType.js", () => ({ getMaterialType: () => "Unknown" }));
vi.mock("../helpers/fabricCache.js", () => ({ getEstimateConfig: () => null }));

import { readPrintedDayNames, setDiagWorkstationResolver } from "./readPrintedFolder.js";

const DAY = "17-09-2026";
const dayDir = () => path.join(h.storageRoot, "PRINTED", DAY);
const makeBatch = (name, files = []) => {
  const dir = path.join(dayDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
  return dir;
};

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rf-names-"));
  h.insertLog.mockClear();
  setDiagWorkstationResolver(() => "TEST-PC");
});

afterEach(() => {
  vi.restoreAllMocks();
  setDiagWorkstationResolver(null);
  try { fs.rmSync(h.storageRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("readPrintedDayNames", () => {
  it("lists every batch of the day with its PDF names, its printer and its folder path", async () => {
    const dirA = makeBatch("PRINTED_101010-Satin Gloss-BOREAL", ["ON401365_Ruby Stone_Tee_1of2.pdf", "ON401366_Sam Reed_Tee_1of1.PDF"]);
    makeBatch("PRINTED_111111-Cotton-mimaki2", ["ON500000_Zed_Tee_1of1.pdf"]);

    const res = await readPrintedDayNames(DAY);

    expect(res.success).toBe(true);
    expect(res.data.dayFolder).toBe(DAY);
    expect(res.data.unreadableBatches).toBe(0);
    const byName = Object.fromEntries(res.data.batches.map((b) => [b.name, b]));
    expect(byName["PRINTED_101010-Satin Gloss-BOREAL"].path).toBe(dirA);
    expect(byName["PRINTED_101010-Satin Gloss-BOREAL"].printer).toBe("BOREAL");
    expect(byName["PRINTED_101010-Satin Gloss-BOREAL"].files.map((f) => f.name).sort()).toEqual([
      "ON401365_Ruby Stone_Tee_1of2.pdf",
      "ON401366_Sam Reed_Tee_1of1.PDF",
    ]);
    expect(byName["PRINTED_111111-Cotton-mimaki2"].printer).toBe("MIMAKI2");
  });

  it("returns only PDFs: the XML, the batch bookkeeping files and sub-folders are not files to search", async () => {
    const dir = makeBatch("PRINTED_101010-G-BOREAL", ["a.pdf", "PRINTED_101010-G-BOREAL.xml", "_batch_info.json", "_rollback_snapshot.json", "notes.txt"]);
    fs.mkdirSync(path.join(dir, "sub.pdf"));

    const res = await readPrintedDayNames(DAY);

    expect(res.data.batches[0].files.map((f) => f.name)).toEqual(["a.pdf"]);
  });

  it("is names only: it opens no file and never touches the database", async () => {
    makeBatch("PRINTED_101010-G-BOREAL", ["a.pdf"]);
    const readFile = vi.spyOn(fs.promises, "readFile");
    const open = vi.spyOn(fs.promises, "open");

    await readPrintedDayNames(DAY);

    expect(readFile).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("carries the order id and customer the parser reads from the name, null when it reads none", async () => {
    makeBatch("PRINTED_101010-G-BOREAL", ["ON401365_Ruby Stone_Tee_1of2.pdf", "nonsense.pdf"]);

    const res = await readPrintedDayNames(DAY);

    const files = Object.fromEntries(res.data.batches[0].files.map((f) => [f.name, f]));
    expect(files["ON401365_Ruby Stone_Tee_1of2.pdf"].orderId).toBe("ON401365");
    expect(files["nonsense.pdf"]).toEqual({ name: "nonsense.pdf", orderId: null, customerName: null });
  });

  it("skips a folder that is not a batch (a createBatch temp folder) and a loose file in the day", async () => {
    makeBatch("PRINTED_101010-G-BOREAL", ["a.pdf"]);
    makeBatch(".tmp-PRINTED_120200-G-BOREAL-4242-1727170000000", ["b.pdf"]);
    fs.writeFileSync(path.join(dayDir(), "stray.pdf"), "x");

    const res = await readPrintedDayNames(DAY);

    expect(res.data.batches.map((b) => b.name)).toEqual(["PRINTED_101010-G-BOREAL"]);
  });

  it("counts a batch folder that cannot be listed instead of failing the day or hiding it", async () => {
    const ok = makeBatch("PRINTED_101010-G-BOREAL", ["a.pdf"]);
    const gone = makeBatch("PRINTED_111111-G-BOREAL", ["b.pdf"]);
    const real = fs.promises.readdir;
    vi.spyOn(fs.promises, "readdir").mockImplementation((p, ...rest) => {
      if (p === gone) return Promise.reject(Object.assign(new Error("EBUSY"), { code: "EBUSY" }));
      return real(p, ...rest);
    });

    const res = await readPrintedDayNames(DAY);

    expect(res.success).toBe(true);
    expect(res.data.unreadableBatches).toBe(1);
    expect(res.data.batches.map((b) => b.path)).toEqual([ok]);
  });

  it("a day folder that cannot be read is an error, traced under the existing day code", async () => {
    const res = await readPrintedDayNames("18-09-2026"); // no such day on disk

    expect(res.success).toBe(false);
    expect(res.errors[0].code).toBe("ENOENT");
    const codes = h.insertLog.mock.calls.map((c) => c[0]?.code);
    expect(codes).toContain("PRINTED_DAY_UNREADABLE");
  });

  it.each([
    ["..\\..\\Windows", "a path walk"],
    ["../x", "a path walk with a forward slash"],
    ["17-09-2026\\PRINTED_101010-G-BOREAL", "a day plus a sub-path"],
    ["2026-09-17", "a date in another shape"],
    ["", "an empty name"],
    [null, "no name"],
    [{ toString: () => DAY }, "an object that prints like a day"],
  ])("refuses %j (%s) before touching the disk", async (bad) => {
    const readdir = vi.spyOn(fs.promises, "readdir");

    const res = await readPrintedDayNames(bad);

    expect(res.success).toBe(false);
    expect(res.errors[0].code).toBe("INVALID_DAY_FOLDER");
    expect(readdir).not.toHaveBeenCalled();
  });
});
