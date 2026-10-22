import path from "node:path";
import { vi } from "vitest";
import { createEtsyImporter } from "./etsyImport.js";
import { ETSY_FABRIC_SEED, etsyKey } from "./etsyFabric.js";

// The harness of the E4 engine tests (etsyImport.retry.test.js): an in-memory disk and an in-memory etsy_imports
// with the real UNIQUE and the guarded move of db.js. The same shape as the harness of etsyImport.test.js, which
// stays as it is (rule 7); the test file that imports this one mocks fabricCache.js and passes the real parser.

export const STORAGE = "C:\\storage";
export const LIBRARY = "C:\\library";
export const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
  ],
};
export const FABRICS = [{ name: "Drill" }, { name: "Calico Plain Cotton" }];
export const MAP = ETSY_FABRIC_SEED.map(([etsy, fabric]) => ({ etsyKey: etsyKey(etsy), fabricName: fabric }));
export const LIB_FILE = "ROSE XWD173706_designer_Half-Drop_211.67_14102025.jpg";
export const OTHER_LIB_FILE = "TULIP XWD204411_designer_Basic_150_14102025.png";

export const makeDisk = () => {
  const files = new Map();
  const folders = new Set([STORAGE, LIBRARY, path.join(STORAGE, "Drill"), path.join(STORAGE, "Calico Plain Cotton")]);
  const calls = { copy: 0, rename: 0 };
  const enoent = (p) => Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
  const fsApi = {
    constants: { COPYFILE_EXCL: 1 },
    readdir: async (dir) => {
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
      files.set(to, files.get(from));
    },
    unlink: async (p) => {
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

// etsy_imports: claim = INSERT OR IGNORE, setState = the unguarded UPDATE, move = the guarded UPDATE of
// moveEtsyImport (true / false / null), with the E4 columns. `beforeMove` lets a test act between the
// engine's read and its CAS (a person dismissing the line on another station).
export const makeImports = () => {
  const rows = new Map();
  const k = (r, t) => `${r}:${t}`;
  const clock = () => Date.parse("2026-10-22T12:00:00Z");
  const stamp = () => new Date(clock()).toISOString();
  const api = {
    rows,
    moves: [],
    failMove: false,
    beforeMove: null,
    get: (r, t) => rows.get(k(r, t)) ?? null,
    claim: ({ receiptId, transactionId, state, fileName = null, folder = null, reason = null, details = {} }) => {
      if (rows.has(k(receiptId, transactionId))) return false;
      rows.set(k(receiptId, transactionId), {
        receiptId,
        transactionId,
        state,
        fileName,
        folder,
        reason,
        createdAt: stamp(),
        updatedAt: stamp(),
        title: details.title ?? null,
        quantity: details.quantity ?? null,
        listingId: details.listingId === undefined || details.listingId === null ? null : String(details.listingId),
        manualXwd: null,
      });
      return true;
    },
    setState: ({ receiptId, transactionId, state, reason = null, fileName }) => {
      const row = rows.get(k(receiptId, transactionId));
      if (!row) return false;
      Object.assign(row, { state, reason, fileName: fileName ?? row.fileName, updatedAt: stamp() });
      return true;
    },
    move: (args) => {
      api.moves.push(args);
      if (api.beforeMove) api.beforeMove(args);
      if (api.failMove) return null;
      const row = rows.get(k(args.receiptId, args.transactionId));
      if (!row || !args.from.includes(row.state)) return false;
      Object.assign(row, {
        state: args.state,
        reason: args.reason ?? null,
        fileName: args.fileName ?? row.fileName,
        folder: args.folder ?? row.folder,
        updatedAt: stamp(),
      });
      return true;
    },
    // a row as the bar's requestEtsyImportRetry leaves it
    putRetry: ({ receiptId = "3456789012", transactionId = "501", manualXwd = null, reason = "No XWD pattern number in the SKU, the variations or the title of the order line.", fileName = null, folder = null } = {}) => {
      rows.set(k(receiptId, transactionId), {
        receiptId,
        transactionId,
        state: "retry",
        fileName,
        folder,
        reason,
        createdAt: stamp(),
        updatedAt: stamp(),
        title: "Rose fabric",
        quantity: 3,
        listingId: "1234567890",
        manualXwd,
      });
    },
    clock,
  };
  return api;
};

export const lm = (over = {}) => ({
  transaction_id: 501,
  listing_id: 1234567890,
  title: "Rose fabric",
  sku: "XWD173706",
  quantity: 3,
  variations: [
    { formatted_name: "Fabric", formatted_value: "Drill" },
    { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" },
  ],
  ...over,
});

export const receipt = (transactions, over = {}) => ({ receipt_id: 3456789012, name: "Ann Lee", transactions, ...over });

export const setupImporter = ({ parse, ...over } = {}) => {
  const disk = makeDisk();
  disk.files.set(path.join(LIBRARY, LIB_FILE), 4096);
  disk.files.set(path.join(LIBRARY, OTHER_LIB_FILE), 2048);
  const imports = makeImports();
  let receipts = [];
  const deps = {
    gate: () => null,
    listReceipts: vi.fn(async () => receipts),
    getFabrics: () => FABRICS,
    getFabricMap: () => MAP,
    getProfile: () => PROFILE,
    storageRoot: () => STORAGE,
    libraryRoot: () => LIBRARY,
    imports,
    fs: disk.fsApi,
    renameNoOverwrite: disk.renameNoOverwrite,
    parse,
    now: imports.clock,
    log: () => {},
    ...over,
  };
  return {
    disk,
    imports,
    tick: createEtsyImporter(deps),
    setReceipts: (r) => {
      receipts = r;
    },
  };
};

export const inboxOf = (disk, folder) => [...disk.files.keys()].filter((p) => path.dirname(p) === path.join(STORAGE, folder)).map((p) => path.basename(p));
