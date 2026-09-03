import { describe, it, expect, vi, beforeEach } from "vitest";

// The "label:printBatch" IPC channel is the third path to the label printer, behind the
// two renderer entries (the Production context menu and the BatchHistory button). Both
// of those are gated at their own call sites, so nothing can reach this channel today
// with the flag off — the gate here exists for the day a renderer gate goes missing
// (2e rewrites Production.jsx broadly). Unlike the RIP handler left ungated in cd8b466,
// this one drives a physical device, so a restored button must not be able to print.
//
// productionHandlers.js pulls electron plus the native better-sqlite3 / electron-store
// chain, so those imports are neutralised — same convention as toLocalBatchPath.test.js,
// with one addition: ipcMain.handle RECORDS the handler instead of discarding it, so the
// registered channel can be invoked directly.

const h = vi.hoisted(() => ({
  handlers: new Map(),
  feature: true,
  printBatchLabel: vi.fn(() => Promise.resolve({ success: true })),
  getFeature: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => h.handlers.set(channel, fn) },
}));
vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: h.printBatchLabel }));
vi.mock("../helpers/shopProfile.js", () => ({
  getFeature: h.getFeature.mockImplementation((name) => (name === "labelPrinting" ? h.feature : false)),
}));
vi.mock("../helpers/db.js", () => ({
  getFileStagesByBatch: () => [],
  getAllFileStages: () => [],
  getFileStagesAfter: () => [],
  advanceFileStage: () => ({ updated: false }),
  clearFileStage: () => {},
  clearFileStagesByBatch: () => {},
  clearAllFileStages: () => {},
  setSewingSent: () => ({ updated: false }),
  setSewingReceived: () => ({ updated: false }),
  getAllStageHistory: () => [],
  fulfillReprintRequests: () => {},
  getOpenReprintRequests: () => [],
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));
vi.mock("../helpers/getRootPath.js", () => ({
  getStorageRootPath: () => "O:\\SPPrintReadyArtwork",
}));

import { registerProductionHandlers } from "./productionHandlers.js";

registerProductionHandlers();
const printBatch = h.handlers.get("label:printBatch");

const DATA = { batchName: "PRINTED_095958-Drill-DGEN", totalMeters: 12.5 };

beforeEach(() => {
  h.feature = true;
  h.printBatchLabel.mockClear();
  h.getFeature.mockClear();
});

describe("label:printBatch — gated on features.labelPrinting", () => {
  it("registers the channel at all", () => {
    // Guards the test itself: a renamed channel would make every assertion below vacuous.
    expect(typeof printBatch).toBe("function");
  });

  it("prints when the flag is on", () => {
    return Promise.resolve(printBatch(null, DATA)).then(() => {
      expect(h.printBatchLabel).toHaveBeenCalledTimes(1);
    });
  });

  it("does not reach the printer when the flag is off", () => {
    h.feature = false;
    return Promise.resolve(printBatch(null, DATA)).then(() => {
      expect(h.printBatchLabel).not.toHaveBeenCalled();
    });
  });

  it("returns this file's error shape when the flag is off", () => {
    // Every other handler here answers { success: false, error: "<string>" }; the gate
    // follows that convention rather than inventing a toIpcError envelope.
    h.feature = false;
    return Promise.resolve(printBatch(null, DATA)).then((res) => {
      expect(res.success).toBe(false);
      expect(typeof res.error).toBe("string");
      expect(res.error.length).toBeGreaterThan(0);
    });
  });

  it("asks the profile for exactly the labelPrinting flag", () => {
    // Pins the flag NAME: a typo reads as an absent flag, fails closed, and silently
    // kills label printing for every shop — the failure mode that looks like nothing.
    return Promise.resolve(printBatch(null, DATA)).then(() => {
      expect(h.getFeature).toHaveBeenCalledWith("labelPrinting");
    });
  });
});
