import { describe, it, expect, vi, beforeEach } from "vitest";

// "stage:setSewingSent" and "stage:setSewingReceived" are the two IPC channels that
// track a hand-off to an EXTERNAL sewing company: one parks a file at "to_sewing", the
// other takes it back into "packed". A shop that sews in-house buys neither.
//
// These are gated harder than label:printBatch (238ac1c) and for a worse failure. That
// handler drives a device; these change PRODUCTION STATE in the shared DB. If a renderer
// gate goes missing in a later cut (2e rewrites Production.jsx broadly), an ungated
// dispatch would park a file in a stage the client never bought — and with the receive
// leg gated, nothing in that client's UI would take it back.
//
// productionHandlers.js pulls electron plus the native better-sqlite3 / electron-store
// chain, so those imports are neutralised — same convention as labelPrintBatchGate.test.js,
// including ipcMain.handle RECORDING the handler so the channel can be invoked directly.

const h = vi.hoisted(() => ({
  handlers: new Map(),
  feature: true,
  getFeature: vi.fn(),
  setSewingSent: vi.fn(() => ({ updated: true })),
  setSewingReceived: vi.fn(() => ({ updated: true })),
  advanceFileStage: vi.fn(() => ({ updated: true })),
  fulfillReprintRequests: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => h.handlers.set(channel, fn) },
}));
vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: vi.fn() }));
vi.mock("../helpers/shopProfile.js", () => ({
  getFeature: h.getFeature.mockImplementation((name) => (name === "sewing" ? h.feature : false)),
}));
vi.mock("../helpers/db.js", () => ({
  getFileStagesByBatch: () => [],
  getAllFileStages: () => [],
  getFileStagesAfter: () => [],
  advanceFileStage: (...args) => h.advanceFileStage(...args),
  clearFileStage: () => {},
  clearFileStagesByBatch: () => {},
  clearAllFileStages: () => {},
  setSewingSent: (...args) => h.setSewingSent(...args),
  setSewingReceived: (...args) => h.setSewingReceived(...args),
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
const sendToSewing = h.handlers.get("stage:setSewingSent");
const receiveFromSewing = h.handlers.get("stage:setSewingReceived");
const advance = h.handlers.get("stage:advance");

const FILE_ID = "ON12345_Jane_XWD00ab_1of1";
const SENT = { fileId: FILE_ID, expectedStage: "qc", sewingCompany: "Olya" };
const RECEIVED = { fileId: FILE_ID, expectedStage: "to_sewing" };

beforeEach(() => {
  h.feature = true;
  h.getFeature.mockClear();
  h.setSewingSent.mockClear();
  h.setSewingReceived.mockClear();
  h.advanceFileStage.mockClear();
  h.fulfillReprintRequests.mockClear();
});

describe("stage:setSewingSent — gated on features.sewing", () => {
  it("registers the dispatch channel at all", () => {
    // Guards the test itself: a renamed channel would make every assertion below vacuous.
    expect(typeof sendToSewing).toBe("function");
  });

  it("dispatches to sewing when the flag is on", () => {
    // The corpse for an over-tight gate: a gate that never opens breaks Alex, whose
    // profile grants sewing.
    const res = sendToSewing(null, SENT);
    expect(h.setSewingSent).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, updated: true });
  });

  it("passes the company and the expected stage through untouched when the flag is on", () => {
    // The gate is a guard clause in front of the handler, not a rewrite of it: the
    // guarded UPDATE still gets its expectedStage, and the free-text company survives.
    sendToSewing(null, SENT);
    expect(h.setSewingSent).toHaveBeenCalledWith(FILE_ID, "TEST-PC", "qc", "Olya");
  });

  it("does not dispatch to the DB when the flag is off", () => {
    h.feature = false;
    sendToSewing(null, SENT);
    expect(h.setSewingSent).not.toHaveBeenCalled();
  });

  it("refuses a dispatch in this file's error shape", () => {
    // Every other handler here answers { success: false, error: "<string>" }; the gate
    // follows that convention rather than inventing a toIpcError envelope.
    h.feature = false;
    const res = sendToSewing(null, SENT);
    expect(res.success).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error.length).toBeGreaterThan(0);
  });

  it("reports no move, so the renderer cannot fake an optimistic transition", () => {
    // useStageTransition writes to the store only on success && updated. A refusal that
    // leaked updated:true would paint a to_sewing card for a row that never moved.
    h.feature = false;
    expect(sendToSewing(null, SENT).updated).toBeUndefined();
  });

  it("reads only the sewing flag before dispatching", () => {
    // Pins the flag NAME. A typo reads as an absent flag, fails closed, and silently
    // kills the sewing round-trip for every shop — the failure mode that looks like
    // nothing. The whole call list is asserted, not just "was called with": that is what
    // separates this from the behavioural tests above, which a stray extra flag read
    // would sail straight past.
    sendToSewing(null, SENT);
    expect(h.getFeature.mock.calls).toEqual([["sewing"]]);
  });
});

describe("stage:setSewingReceived — gated on features.sewing", () => {
  it("registers the receive channel at all", () => {
    expect(typeof receiveFromSewing).toBe("function");
  });

  it("receives back into packed when the flag is on", () => {
    const res = receiveFromSewing(null, RECEIVED);
    expect(h.setSewingReceived).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, updated: true });
  });

  it("still completes open reprint requests when the flag is on", () => {
    // Receive is the entry point to "packed", so it fulfils reprints. The gate must sit
    // in front of the handler without disturbing what the handler does.
    receiveFromSewing(null, RECEIVED);
    expect(h.fulfillReprintRequests).toHaveBeenCalledWith(FILE_ID);
  });

  it("does not write the receive to the DB when the flag is off", () => {
    h.feature = false;
    receiveFromSewing(null, RECEIVED);
    expect(h.setSewingReceived).not.toHaveBeenCalled();
  });

  it("does not complete reprint requests when the flag is off", () => {
    // The second side effect of this handler. A gate placed after the DB call — or only
    // around it — would still silently close a client's open reprint.
    h.feature = false;
    receiveFromSewing(null, RECEIVED);
    expect(h.fulfillReprintRequests).not.toHaveBeenCalled();
  });

  it("refuses a receive in this file's error shape", () => {
    h.feature = false;
    const res = receiveFromSewing(null, RECEIVED);
    expect(res.success).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error.length).toBeGreaterThan(0);
  });

  it("reads only the sewing flag before receiving", () => {
    receiveFromSewing(null, RECEIVED);
    expect(h.getFeature.mock.calls).toEqual([["sewing"]]);
  });

  it("re-reads the flag on every call — a refusal never latches the channel off", () => {
    // Both legs, and the property no other test here covers: the flag is read per call,
    // not remembered. profile:set invalidates and reloads the profile cache at runtime,
    // so a handler that cached its answer — or latched after the first refusal — would
    // keep answering from a profile the shop no longer has.
    h.feature = false;
    expect(sendToSewing(null, SENT).success).toBe(false);
    h.feature = true;
    expect(sendToSewing(null, SENT).success).toBe(true);
    h.feature = false;
    expect(receiveFromSewing(null, RECEIVED).success).toBe(false);
    h.feature = true;
    expect(receiveFromSewing(null, RECEIVED).success).toBe(true);
  });
});

describe("the sewing gate does not close the exit from to_sewing", () => {
  it("leaves stage:advance ungated with the flag off", () => {
    // The deliberate scope limit. "Go back" (STAGE_PREV[to_sewing] = qc) and the whole
    // rest of the pipeline run on stage:advance, which is NOT a sewing channel. Gating
    // it would trap any legacy row already parked at to_sewing in a shop whose flag is
    // off — a stage with no way out is worse than a stage nobody can enter.
    h.feature = false;
    const res = advance(null, { fileId: FILE_ID, newStage: "qc", expectedStage: "to_sewing" });
    expect(h.advanceFileStage).toHaveBeenCalledWith(FILE_ID, "qc", "TEST-PC", "to_sewing");
    expect(res).toEqual({ success: true, updated: true });
  });
});
