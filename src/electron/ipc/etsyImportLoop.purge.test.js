import { describe, it, expect, vi, afterEach } from "vitest";

// D81: the loop empties the buyer's notes of long-finished lines after every tick (the first one a minute after
// start-up), and a purge that cannot run (null) never stops the loop. Harness as in etsyImportLoop.buyerNote.test.js.
const calls = vi.hoisted(() => ({ order: [], purgeResult: 0 }));

vi.mock("./etsyHandlers.js", () => ({ getEtsyParts: () => ({ credentials: { status: () => ({ connected: true, shopId: 777 }) }, client: {} }) }));
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
  purgeOldEtsyBuyerNotes: () => {
    calls.order.push("purge");
    return calls.purgeResult;
  },
}));
vi.mock("../helpers/renameNoOverwrite.js", () => ({ renameNoOverwrite: async () => {} }));
vi.mock("../helpers/parseFileName.js", () => ({ parsePrintFileName: () => null }));
vi.mock("../helpers/etsyImport.js", () => ({
  createEtsyImporter: () =>
    Object.assign(
      async () => {
        calls.order.push("tick");
        return { ran: false, reason: "switched off" };
      },
      { importReceipt: async () => ({ ran: false }) },
    ),
}));

import { startEtsyImportLoop, requestEtsyImportTick } from "./etsyImportLoop.js";

let stop = null;
afterEach(() => {
  stop?.();
  stop = null;
  calls.order = [];
  calls.purgeResult = 0;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the buyer-note purge in the loop", () => {
  it("runs once after a tick, even one the gate stopped", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    stop = startEtsyImportLoop({ isPaused: () => false });
    requestEtsyImportTick();
    await settle();
    expect(calls.order).toEqual(["tick", "purge"]);
  });

  it("a purge that could not run (null) does not break the next tick", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    calls.purgeResult = null;
    stop = startEtsyImportLoop({ isPaused: () => false });
    requestEtsyImportTick();
    await settle();
    requestEtsyImportTick();
    await settle();
    expect(calls.order).toEqual(["tick", "purge", "tick", "purge"]);
  });
});
