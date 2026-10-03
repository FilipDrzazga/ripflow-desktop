import { describe, it, expect, vi, beforeEach } from "vitest";

// stage:advance closes an open reprint request when the file reaches "packed" - and, since
// "Mark as Shipped", also on a jump straight to "shipped" (which passes packed without stopping).
// Without it the request stays open and the Reprints pill counts a phantom (database.md).
// Same convention as sewingStageGate.test.js: electron / db neutralised, ipcMain.handle records.

const h = vi.hoisted(() => ({
  handlers: new Map(),
  advanceFileStage: vi.fn(() => ({ updated: true })),
  fulfillReprintRequests: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => h.handlers.set(channel, fn) },
}));
vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: vi.fn() }));
vi.mock("../helpers/shopProfile.js", () => ({ getFeature: () => true }));
vi.mock("../helpers/db.js", () => ({
  getFileStagesByBatch: () => [],
  getAllFileStages: () => [],
  getFileStagesAfter: () => [],
  advanceFileStage: (...args) => h.advanceFileStage(...args),
  clearFileStage: () => {},
  clearFileStagesByBatch: () => {},
  clearAllFileStages: () => {},
  setSewingSent: () => ({ updated: true }),
  setSewingReceived: () => ({ updated: true }),
  getAllStageHistory: () => [],
  fulfillReprintRequests: (...args) => h.fulfillReprintRequests(...args),
  getOpenReprintRequests: () => [],
  getOpenReprintRequestsByFileIds: () => [],
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ workstationName: "TEST-PC" }) }));
vi.mock("../helpers/getRootPath.js", () => ({
  getStorageRootPath: () => "O:\\SPPrintReadyArtwork",
}));

import { registerProductionHandlers } from "./productionHandlers.js";

registerProductionHandlers();
const advance = h.handlers.get("stage:advance");
const FILE_ID = "ON12345_Jane_XWD00ab_1of1";

beforeEach(() => {
  h.advanceFileStage.mockReset();
  h.advanceFileStage.mockReturnValue({ updated: true });
  h.fulfillReprintRequests.mockClear();
});

describe("stage:advance - reprint requests", () => {
  it("registers the channel at all", () => {
    expect(typeof advance).toBe("function");
  });

  it("completes the open reprint when the file reaches packed", () => {
    advance(null, { fileId: FILE_ID, newStage: "packed", expectedStage: "qc" });
    expect(h.fulfillReprintRequests).toHaveBeenCalledWith(FILE_ID);
  });

  it("completes it on a jump to shipped from any earlier stage", () => {
    for (const from of ["printed", "heatpress", "qc", "to_sewing", "from_sewing", "packed"]) {
      h.fulfillReprintRequests.mockClear();
      advance(null, { fileId: FILE_ID, newStage: "shipped", expectedStage: from });
      expect(h.fulfillReprintRequests, from).toHaveBeenCalledWith(FILE_ID);
    }
  });

  it("does not complete it when the guarded UPDATE moved nothing (another station got there first)", () => {
    h.advanceFileStage.mockReturnValue({ updated: false });
    const res = advance(null, { fileId: FILE_ID, newStage: "shipped", expectedStage: "qc" });
    expect(h.fulfillReprintRequests).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, updated: false });
  });

  it("does not complete it for a stage before packed", () => {
    advance(null, { fileId: FILE_ID, newStage: "heatpress", expectedStage: "printed" });
    advance(null, { fileId: FILE_ID, newStage: "qc", expectedStage: "heatpress" });
    expect(h.fulfillReprintRequests).not.toHaveBeenCalled();
  });

  it("passes the expected stage to the guarded UPDATE on a jump", () => {
    advance(null, { fileId: FILE_ID, newStage: "shipped", expectedStage: "heatpress" });
    expect(h.advanceFileStage).toHaveBeenCalledWith(FILE_ID, "shipped", "TEST-PC", "heatpress");
  });
});
