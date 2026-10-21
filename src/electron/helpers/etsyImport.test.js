import { describe, it, expect, vi } from "vitest";
import path from "node:path";

// The Etsy import engine (plan E3b-2) on an in-memory disk, an in-memory etsy_imports with the real UNIQUE
// semantics, and the REAL parser. Same isolation of the parser as parseFileName.etsy.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { createEtsyImporter, STALE_PENDING_MS } from "./etsyImport.js";
import { ETSY_FABRIC_SEED, etsyKey } from "./etsyFabric.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";

const STORAGE = "C:\\storage";
const LIBRARY = "C:\\library";
const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
  ],
};
const FABRICS = [{ name: "Drill" }, { name: "Calico Plain Cotton" }, { name: "Eco_Under" }];
const MAP = ETSY_FABRIC_SEED.map(([etsy, fabric]) => ({ etsyKey: etsyKey(etsy), fabricName: fabric }));

const LIB_FILE = "ROSE XWD173706_designer_Half-Drop_211.67_14102025.jpg";

// A disk of { path -> size } plus the folders that exist.
const makeDisk = () => {
  const files = new Map();
  const folders = new Set([STORAGE, LIBRARY, path.join(STORAGE, "Drill"), path.join(STORAGE, "Calico Plain Cotton"), path.join(STORAGE, "Eco_Under")]);
  const calls = { copy: 0, unlink: [], rename: 0 };
  const enoent = (p) => Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
  const fsApi = {
    constants: { COPYFILE_EXCL: 1 },
    readdir: async (dir) => {
      if (fsApi.libraryDown && dir === LIBRARY) throw Object.assign(new Error("EIO"), { code: "EIO" });
      if (!folders.has(dir)) throw enoent(dir);
      return [...files.keys()].filter((p) => path.dirname(p) === dir).map((p) => ({ name: path.basename(p), isFile: () => true }));
    },
    stat: async (p) => {
      if (folders.has(p)) return { isDirectory: () => true, size: 0 };
      if (!files.has(p)) throw enoent(p);
      return { isDirectory: () => false, size: files.get(p) };
    },
    copyFile: async (from, to) => {
      calls.copy += 1;
      if (!files.has(from)) throw enoent(from);
      if (files.has(to)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      files.set(to, fsApi.shortCopy ? files.get(from) - 1 : files.get(from));
    },
    unlink: async (p) => {
      calls.unlink.push(p);
      if (!files.delete(p)) throw enoent(p);
    },
  };
  const renameNoOverwrite = async (from, to) => {
    calls.rename += 1;
    if (files.has(to)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    files.set(to, files.get(from));
    files.delete(from);
  };
  return { files, folders, calls, fsApi, renameNoOverwrite };
};

// etsy_imports with the UNIQUE of the real table: claim -> true | false; get -> row | null.
const makeImports = () => {
  const rows = new Map();
  const k = (r, t) => `${r}:${t}`;
  const api = {
    rows,
    failClaim: false,
    failGet: false,
    get: (r, t) => (api.failGet ? undefined : (rows.get(k(r, t)) ?? null)),
    claim: ({ receiptId, transactionId, state, fileName = null, folder = null, reason = null }) => {
      if (api.failClaim) return null;
      if (rows.has(k(receiptId, transactionId))) return false;
      const at = new Date(api.clock()).toISOString();
      rows.set(k(receiptId, transactionId), { receiptId, transactionId, state, fileName, folder, reason, createdAt: at, updatedAt: at });
      return true;
    },
    setState: ({ receiptId, transactionId, state, reason = null, fileName }) => {
      const row = rows.get(k(receiptId, transactionId));
      if (!row) return false;
      Object.assign(row, { state, reason, fileName: fileName ?? row.fileName, updatedAt: new Date(api.clock()).toISOString() });
      return true;
    },
    clock: () => Date.parse("2026-10-21T12:00:00Z"),
  };
  return api;
};

const lm = (over = {}) => ({
  transaction_id: 501,
  title: "Rose fabric",
  sku: "XWD173706",
  quantity: 3,
  variations: [
    { formatted_name: "Fabric", formatted_value: "Drill" },
    { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" },
  ],
  ...over,
});
const fq = (over = {}) =>
  lm({
    transaction_id: 502,
    quantity: 2,
    variations: [
      { formatted_name: "Fabric", formatted_value: "Calico Cotton Plain" },
      { formatted_name: "Size", formatted_value: "Fat Quarter - 65 x 48 cm" },
    ],
    ...over,
  });
const receipt = (transactions, over = {}) => ({ receipt_id: 3456789012, name: "Ann Lee", transactions, ...over });

const setup = (over = {}) => {
  const disk = makeDisk();
  disk.files.set(path.join(LIBRARY, LIB_FILE), 4096);
  const imports = makeImports();
  let receipts = [];
  const state = { gate: null, now: imports.clock(), logs: [] };
  const deps = {
    gate: () => state.gate,
    listReceipts: vi.fn(async () => receipts),
    getFabrics: () => FABRICS,
    getFabricMap: () => MAP,
    getProfile: () => PROFILE,
    storageRoot: () => STORAGE,
    libraryRoot: () => LIBRARY,
    imports,
    fs: disk.fsApi,
    renameNoOverwrite: disk.renameNoOverwrite,
    parse: parsePrintFileName,
    now: () => state.now,
    log: (line) => state.logs.push(line),
    ...over,
  };
  const tick = createEtsyImporter(deps);
  return {
    disk,
    imports,
    state,
    deps,
    tick,
    setReceipts: (r) => {
      receipts = r;
    },
  };
};

const inbox = (disk, folder) => [...disk.files.keys()].filter((p) => path.dirname(p) === path.join(STORAGE, folder)).map((p) => path.basename(p));

describe("a normal tick", () => {
  it("imports every readable line into the inbox folder of its fabric, and the name reads back", async () => {
    const t = setup();
    t.setReceipts([receipt([lm(), fq()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ ran: true, imported: 2, needsReview: 0, failed: 0 });
    const lmName = "ET3456789012_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg";
    const fqName = "ET3456789012_Ann_Lee_2of2_Calico Plain Cotton_2x_Fat Quarter - 65 x 48 cm_XWD173706_Half-Drop_ETSY.jpg";
    expect(inbox(t.disk, "Drill")).toEqual([lmName]);
    expect(inbox(t.disk, "Calico Plain Cotton")).toEqual([fqName]);
    for (const name of [lmName, fqName]) {
      const parsed = parsePrintFileName(name, { shopConfig: PROFILE });
      expect(parsed.errors).toEqual([]);
      expect(parsed.source).toBe("ETSY");
    }
    expect([...t.imports.rows.values()].map((r) => r.state)).toEqual([ETSY_IMPORT_STATE.DONE, ETSY_IMPORT_STATE.DONE]);
  });

  it("copies from the library, never moves: the pattern file is still there and no .tmp is left", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(t.disk.files.has(path.join(LIBRARY, LIB_FILE))).toBe(true);
    expect([...t.disk.files.keys()].some((p) => p.endsWith(".tmp"))).toBe(false);
  });

  it("the .tmp lives in the SAME folder as the final name (the rename never crosses a volume)", async () => {
    const t = setup();
    const seen = [];
    const original = t.disk.fsApi.copyFile;
    t.disk.fsApi.copyFile = async (from, to) => {
      seen.push(to);
      return original(from, to);
    };
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(seen).toEqual([path.join(STORAGE, "Drill", ".etsy-3456789012-501.tmp")]);
  });

  it("a second tick over the same orders copies nothing", async () => {
    const t = setup();
    t.setReceipts([receipt([lm(), fq()])]);
    await t.tick();
    const copies = t.disk.calls.copy;
    const out = await t.tick();
    expect(t.disk.calls.copy).toBe(copies);
    expect(out).toMatchObject({ imported: 0, skipped: 2 });
  });

  it("a file the operator already sent to a batch is not brought back (done stays done)", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    for (const p of [...t.disk.files.keys()]) if (p.startsWith(path.join(STORAGE, "Drill"))) t.disk.files.delete(p);
    await t.tick();
    expect(inbox(t.disk, "Drill")).toEqual([]);
  });

  it("two importers over the same shared table import a line once (UNIQUE)", async () => {
    const a = setup();
    const b = setup({ imports: a.imports, fs: a.disk.fsApi, renameNoOverwrite: a.disk.renameNoOverwrite });
    a.setReceipts([receipt([lm()])]);
    b.setReceipts([receipt([lm()])]);
    await Promise.all([a.tick(), b.tick()]);
    expect(a.disk.calls.copy).toBe(1);
    expect(inbox(a.disk, "Drill")).toHaveLength(1);
  });

  it("a line without ids is skipped, not guessed", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ transaction_id: null })]), { receipt_id: null, transactions: [lm()] }]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 0, skipped: 2 });
    expect(t.imports.rows.size).toBe(0);
  });
});

describe("fail closed (W3)", () => {
  it("a closed gate asks nobody and writes nothing", async () => {
    const t = setup();
    t.state.gate = "features.etsy is off";
    const out = await t.tick();
    expect(out).toMatchObject({ ran: false, reason: "features.etsy is off" });
    expect(t.deps.listReceipts).not.toHaveBeenCalled();
    expect(t.imports.rows.size).toBe(0);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("an import table that cannot be read ends the tick before any copy", async () => {
    const t = setup();
    t.imports.failGet = true;
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out.reason).toMatch(/could not be read/);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("an import table that cannot be written ends the tick before any copy", async () => {
    const t = setup();
    t.imports.failClaim = true;
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out.reason).toMatch(/could not be written/);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("an unreadable catalogue, map or profile ends the tick without a row", async () => {
    for (const over of [{ getFabrics: () => null }, { getFabricMap: () => null }, { getProfile: () => null }]) {
      const t = setup(over);
      t.setReceipts([receipt([lm()])]);
      const out = await t.tick();
      expect(out.ran).toBe(true);
      expect(out.reason).toBeTruthy();
      expect(t.imports.rows.size).toBe(0);
      expect(t.disk.calls.copy).toBe(0);
    }
  });

  it("an Etsy error is reported, not thrown", async () => {
    const t = setup({ listReceipts: async () => { throw Object.assign(new Error("Etsy answered 500"), { code: "ETSY_REQUEST_FAILED" }); } });
    const out = await t.tick();
    expect(out.reason).toMatch(/Etsy answered 500/);
  });

  it("a library that cannot be read is the environment's problem: no row, the next tick imports", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()])]);
    t.disk.fsApi.libraryDown = true;
    const first = await t.tick();
    expect(first.reason).toMatch(/Cannot read the folder/);
    expect(t.imports.rows.size).toBe(0);
    t.disk.fsApi.libraryDown = false;
    expect((await t.tick()).imported).toBe(1);
  });
});

describe("a line that cannot be read as one thing is recorded with its reason and writes no file", () => {
  const cases = [
    ["no XWD", () => lm({ sku: "" }), /No XWD/],
    ["two different XWD", () => lm({ title: "Rose XWD9" }), /more than one XWD/],
    ["a zero quantity", () => lm({ quantity: 0 }), /quantity/i],
    ["no Fabric variation", () => lm({ variations: [{ formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] }), /no "Fabric"/],
    ["a fabric that is not in Fabrics", () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Moleskin" }, { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] }), /not in Fabrics/],
    ["no variation that names the print type", () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Drill" }] }), /no variation that could name the print type/],
    ["a variation that is not a print type", () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Drill" }, { formatted_name: "Pack", formatted_value: "Rolled" }] }), /No variation reads as a print type/],
    [
      "two variations that both read as a print type",
      () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Drill" }, { formatted_name: "A", formatted_value: "Linear Meter - 1m increments" }, { formatted_name: "B", formatted_value: "Sample Print - 20 x 20 cm" }] }),
      /More than one variation reads as a print type/,
    ],
    ["a Fat Quarter without its size", () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Drill" }, { formatted_name: "Size", formatted_value: "Fat Quarter" }] }), /No variation reads as a print type/],
    ["a fabric whose name holds an underscore (the name would not read back)", () => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Eco Under" }, { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] }), /different material|No variation reads/],
  ];

  it.each(cases)("%s", async (_label, make, reason) => {
    const t = setup();
    t.setReceipts([receipt([make()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    const [row] = [...t.imports.rows.values()];
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(reason);
    expect(t.disk.calls.copy).toBe(0);
    expect([...t.disk.files.keys()].filter((p) => p.startsWith(STORAGE))).toEqual([]);
  });

  it("a recorded line is not looked at again (the reason stays what it was)", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "" })])]);
    await t.tick();
    const reason = [...t.imports.rows.values()][0].reason;
    t.setReceipts([receipt([lm()])]); // the same line, now readable - a person decides, not the tick
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, skipped: 1 });
    expect([...t.imports.rows.values()][0].reason).toBe(reason);
  });

  it("no inbox folder for the fabric", async () => {
    const t = setup();
    t.disk.folders.delete(path.join(STORAGE, "Drill"));
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect([...t.imports.rows.values()][0].reason).toMatch(/no inbox folder "Drill"/);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("no library file, and two library files, for the XWD (XWD1737 is not XWD173706)", async () => {
    const none = setup();
    none.disk.files.clear();
    none.disk.files.set(path.join(LIBRARY, "OTHER XWD17370_d_Basic_1_1.jpg"), 10);
    none.setReceipts([receipt([lm()])]);
    await none.tick();
    expect([...none.imports.rows.values()][0].reason).toMatch(/No image with XWD173706/);

    const two = setup();
    two.disk.files.set(path.join(LIBRARY, "ROSE XWD173706 copy_d_Basic_1_1.png"), 10);
    two.setReceipts([receipt([lm()])]);
    await two.tick();
    expect([...two.imports.rows.values()][0].reason).toMatch(/2 images carry XWD173706/);
    expect(two.disk.calls.copy).toBe(0);
  });

  it("a library file whose name has no repeat type", async () => {
    const t = setup();
    t.disk.files.clear();
    t.disk.files.set(path.join(LIBRARY, "ROSE XWD173706_designer_211.67_1.jpg"), 10);
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect([...t.imports.rows.values()][0].reason).toMatch(/no repeat type/);
  });

  it("a name that does not read back the same (a parser that disagrees) is refused, not written", async () => {
    const parse = (name, opts) => ({ ...parsePrintFileName(name, opts), qty: 99 });
    const t = setup({ parse });
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    const [row] = [...t.imports.rows.values()];
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(/different quantity/);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a name the parser refuses is refused, not written", async () => {
    const parse = (name, opts) => ({ ...parsePrintFileName(name, opts), errors: [{ code: "MISSING_QTY" }] });
    const t = setup({ parse });
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect([...t.imports.rows.values()][0].reason).toMatch(/parser refuses it \(MISSING_QTY\)/);
  });

  it("a path too long for the inbox is refused", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()], { name: `${"A".repeat(120)} ${"B".repeat(120)}` })]);
    await t.tick();
    expect([...t.imports.rows.values()][0].reason).toMatch(/too long/);
  });

  it("a hostile customer name never reaches the path", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()], { name: "..\\..\\Evil/Name:x_y" })]);
    await t.tick();
    const names = [...t.disk.files.keys()].filter((p) => p.startsWith(STORAGE)).map((p) => path.relative(STORAGE, p));
    expect(names).toHaveLength(1);
    expect(names[0].split(path.sep)).toHaveLength(2); // <Fabric>\<file>, nothing deeper
    expect(names[0]).not.toContain("..");
  });
});

describe("the copy itself", () => {
  it("a name already taken in the inbox is NEEDS_REVIEW, the other file untouched, the tmp removed (EEXIST)", async () => {
    const t = setup();
    const existing = path.join(STORAGE, "Drill", "ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg");
    t.disk.files.set(existing, 7);
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    expect(t.disk.files.get(existing)).toBe(7);
    expect([...t.disk.files.keys()].some((p) => p.endsWith(".tmp"))).toBe(false);
    expect([...t.imports.rows.values()][0].reason).toMatch(/already in the inbox folder/);
  });

  it("a copy of the wrong size is FAILED and leaves no file", async () => {
    const t = setup();
    t.disk.fsApi.shortCopy = true;
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, failed: 1 });
    expect([...t.imports.rows.values()][0].state).toBe(ETSY_IMPORT_STATE.FAILED);
    expect(inbox(t.disk, "Drill")).toEqual([]);
  });

  it("the row carries the target name from the claim on (W2 needs it)", async () => {
    const t = setup();
    const original = t.disk.fsApi.copyFile;
    let rowDuringCopy = null;
    t.disk.fsApi.copyFile = async (...args) => {
      rowDuringCopy = { ...[...t.imports.rows.values()][0] };
      return original(...args);
    };
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(rowDuringCopy).toMatchObject({ state: ETSY_IMPORT_STATE.PENDING, folder: "Drill" });
    expect(rowDuringCopy.fileName).toMatch(/^ET3456789012_.*_ETSY\.jpg$/);
  });
});

describe("a PENDING row found later is never copied again on its own (W2)", () => {
  const pendingRow = (t, ageMs, { withFile }) => {
    const fileName = "ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg";
    t.imports.rows.set("3456789012:501", {
      receiptId: "3456789012",
      transactionId: "501",
      state: ETSY_IMPORT_STATE.PENDING,
      fileName,
      folder: "Drill",
      reason: null,
      updatedAt: new Date(t.state.now - ageMs).toISOString(),
    });
    if (withFile) t.disk.files.set(path.join(STORAGE, "Drill", fileName), 4096);
  };

  it("old, with its file in the folder: DONE, nothing copied", async () => {
    const t = setup();
    pendingRow(t, STALE_PENDING_MS + 1000, { withFile: true });
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(t.disk.calls.copy).toBe(0);
    expect(t.imports.rows.get("3456789012:501").state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(out.imported).toBe(1);
  });

  it("old, with no file (it may already have gone to a batch): NEEDS_REVIEW, still nothing copied, the half tmp removed", async () => {
    const t = setup();
    pendingRow(t, STALE_PENDING_MS + 1000, { withFile: false });
    const tmp = path.join(STORAGE, "Drill", ".etsy-3456789012-501.tmp");
    t.disk.files.set(tmp, 10);
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(t.disk.calls.copy).toBe(0);
    const row = t.imports.rows.get("3456789012:501");
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(/interrupted/);
    expect(t.disk.files.has(tmp)).toBe(false);
  });

  it("young: left alone (another process may be copying it right now)", async () => {
    const t = setup();
    pendingRow(t, 1000, { withFile: false });
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(t.imports.rows.get("3456789012:501").state).toBe(ETSY_IMPORT_STATE.PENDING);
    expect(out).toMatchObject({ imported: 0, skipped: 1 });
    expect(t.disk.calls.copy).toBe(0);
  });
});
