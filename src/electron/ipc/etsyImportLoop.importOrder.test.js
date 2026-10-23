import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// "Import this order" (plan E5) shares the loop's `running` with the tick (W5). The loop loads Electron through its
// imports, so every part is mocked; the engine is a stub whose tick and importReceipt end when the test says so.
const engine = vi.hoisted(() => ({ tick: null, deps: null, getReceipt: null }));

vi.mock("./etsyHandlers.js", () => ({ getEtsyParts: () => ({ credentials: { status: () => ({ connected: true, shopId: 777 }) }, client: { getReceipt: (...args) => engine.getReceipt(...args) } }) }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY" }), getEtsyImportSince: () => null }));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => "C:\\storage" }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}), getFeature: () => true }));
vi.mock("../helpers/db.js", () => ({
  isDbOpen: () => true,
  getAllFabrics: () => [],
  getEtsyFabricMap: () => [],
  getEtsyListingFabric: () => null,
  getEtsyImport: () => null,
  claimEtsyImport: () => true,
  setEtsyImportState: () => true,
  moveEtsyImport: () => true,
  listEtsyImportRetries: () => null,
  setEtsyImportShipBy: () => null,
  setEtsyImportBuyerNote: () => null,
}));
vi.mock("../helpers/renameNoOverwrite.js", () => ({ renameNoOverwrite: async () => {} }));
vi.mock("../helpers/parseFileName.js", () => ({ parsePrintFileName: () => null }));
vi.mock("../helpers/etsyImport.js", () => ({
  createEtsyImporter: (deps) => {
    engine.deps = deps;
    return engine.tick;
  },
}));

import { startEtsyImportLoop, importEtsyReceiptNow, requestEtsyImportTick, gateReason } from "./etsyImportLoop.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const SUMMARY = { ran: true, reason: null, imported: 1, needsReview: 0, failed: 0, skipped: 0 };
let stop = null;

beforeEach(() => {
  vi.useFakeTimers();
  engine.tick = vi.fn(async () => SUMMARY);
  engine.tick.importReceipt = vi.fn(async () => SUMMARY);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe("importEtsyReceiptNow", () => {
  it("before the loop is started: refused with a reason, nothing run", async () => {
    const out = await importEtsyReceiptNow("3456789012");
    expect(out).toMatchObject({ ran: false, reason: expect.stringContaining("not started") });
    expect(engine.tick.importReceipt).not.toHaveBeenCalled();
  });

  it("runs the engine's importReceipt with the number and hands its summary back", async () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    expect(await importEtsyReceiptNow("3456789012")).toEqual(SUMMARY);
    expect(engine.tick.importReceipt).toHaveBeenCalledWith("3456789012");
  });

  it("while a tick runs: busy, and the engine is not asked", async () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    const tickEnd = deferred();
    engine.tick.mockImplementationOnce(() => tickEnd.promise);
    requestEtsyImportTick();
    expect(await importEtsyReceiptNow("3456789012")).toEqual({ busy: true });
    expect(engine.tick.importReceipt).not.toHaveBeenCalled();
    tickEnd.resolve(SUMMARY);
  });

  it("while an order import runs: a second one is busy and a tick that comes due skips", async () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    const end = deferred();
    engine.tick.importReceipt.mockImplementationOnce(() => end.promise);
    const first = importEtsyReceiptNow("3456789012");
    expect(await importEtsyReceiptNow("3456789012")).toEqual({ busy: true });
    await vi.advanceTimersByTimeAsync(60 * 1000); // the first tick comes due
    expect(engine.tick).not.toHaveBeenCalled();
    end.resolve(SUMMARY);
    expect(await first).toEqual(SUMMARY);
  });

  it("a Retry's tick requested during the order import runs right after it", async () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    const end = deferred();
    engine.tick.importReceipt.mockImplementationOnce(() => end.promise);
    const first = importEtsyReceiptNow("3456789012");
    requestEtsyImportTick();
    expect(engine.tick).not.toHaveBeenCalled();
    end.resolve(SUMMARY);
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.tick).toHaveBeenCalledTimes(1);
  });

  it("a failing order import frees the loop for the next tick", async () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    engine.tick.importReceipt.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await expect(importEtsyReceiptNow("3456789012")).rejects.toThrow("boom");
    requestEtsyImportTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.tick).toHaveBeenCalledTimes(1);
  });
});

describe("the engine's parts for the order import", () => {
  it("fetches the receipt through the station's client and passes the gate options through", async () => {
    engine.getReceipt = vi.fn(async () => ({ receipt_id: 1 }));
    stop = startEtsyImportLoop({ isPaused: () => false });
    expect(await engine.deps.getReceipt("3456789012")).toEqual({ receipt_id: 1 });
    expect(engine.getReceipt).toHaveBeenCalledWith("3456789012");
    // since is null in this harness: the tick's gate is closed by the start date, the order import's is not
    expect(engine.deps.gate()).toBe("the import has no start date");
    expect(engine.deps.gate({ anyStartDate: true })).toBeNull();
    expect(gateReason(() => false, { anyStartDate: true })).toBeNull();
    expect(gateReason(() => true, { anyStartDate: true })).toBe("the station sleeps or is locked");
  });
});
