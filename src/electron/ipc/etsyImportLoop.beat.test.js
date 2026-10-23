import { describe, it, expect, vi, afterEach } from "vitest";

// Plan IMP-W: after every tick the loop tells the shared database whether THIS station is switched on as the importer
// (the heartbeat Settings > Etsy warns from). The switch decides, not the gate; a heartbeat that fails never stops a tick.
// Harness as in etsyImportLoop.purge.test.js.
const calls = vi.hoisted(() => ({ order: [], settings: {}, touchFails: false }));

vi.mock("./etsyHandlers.js", () => ({ getEtsyParts: () => ({ credentials: { status: () => ({ connected: true, shopId: 777 }) }, client: {} }) }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => calls.settings, getEtsyImportSince: () => null }));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => "C:\\storage" }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}), getFeature: () => true }));
vi.mock("../helpers/db.js", () => ({
  isDbOpen: () => true,
  getAllFabrics: () => [],
  getEtsyFabricMap: () => [],
  getEtsyListingFabric: () => null,
  getEtsyListingType: () => null,
  getEtsyImport: () => null,
  claimEtsyImport: () => true,
  setEtsyImportState: () => true,
  moveEtsyImport: () => true,
  listEtsyImportRetries: () => null,
  setEtsyImportShipBy: () => null,
  setEtsyImportBuyerNote: () => null,
  purgeOldEtsyBuyerNotes: () => {
    calls.order.push("purge");
    return 0;
  },
  touchEtsyImporter: (arg) => {
    calls.order.push(["touch", arg]);
    if (calls.touchFails) throw new Error("disk I/O error");
    return true;
  },
  removeEtsyImporter: (name) => {
    calls.order.push(["remove", name]);
    return { deleted: true };
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
  calls.settings = {};
  calls.touchFails = false;
  vi.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const runOneTick = async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stop = startEtsyImportLoop({ isPaused: () => false });
  requestEtsyImportTick();
  await settle();
};

describe("the heartbeat of the Etsy importer switch", () => {
  it("a station with the switch On writes its heartbeat after the tick, with its interval", async () => {
    calls.settings = { workstationName: " Cotton PC ", etsyImportEnabled: true, etsyImportIntervalMin: 5, etsyLibraryPath: "D:\\ETSY" };
    await runOneTick();
    expect(calls.order).toEqual(["tick", ["touch", { workstation: "Cotton PC", intervalMin: 5 }], "purge"]);
  });

  it("the interval is the clamped setting (default 2 when unset)", async () => {
    calls.settings = { workstationName: "Cotton PC", etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY" };
    await runOneTick();
    expect(calls.order[1]).toEqual(["touch", { workstation: "Cotton PC", intervalMin: 2 }]);
  });

  it("a station with the switch Off removes its heartbeat instead", async () => {
    calls.settings = { workstationName: "Cotton PC", etsyImportEnabled: false, etsyLibraryPath: "D:\\ETSY" };
    await runOneTick();
    expect(calls.order).toEqual(["tick", ["remove", "Cotton PC"], "purge"]);
  });

  it("only an explicit true is On", async () => {
    calls.settings = { workstationName: "Cotton PC", etsyImportEnabled: "true" };
    await runOneTick();
    expect(calls.order[1]).toEqual(["remove", "Cotton PC"]);
  });

  it("a station with no name writes and removes nothing", async () => {
    calls.settings = { workstationName: "  ", etsyImportEnabled: true };
    await runOneTick();
    expect(calls.order).toEqual(["tick", "purge"]);
  });

  it("a heartbeat that throws never stops the tick: the purge still runs and the next tick comes", async () => {
    calls.touchFails = true;
    calls.settings = { workstationName: "Cotton PC", etsyImportEnabled: true };
    await runOneTick();
    requestEtsyImportTick();
    await settle();
    expect(calls.order.filter((o) => o === "tick")).toHaveLength(2);
    expect(calls.order.filter((o) => o === "purge")).toHaveLength(2);
  });
});
