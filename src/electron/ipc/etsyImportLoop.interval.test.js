import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// FILIP 2026-10-22: the importer's pace is a setting (Settings > Etsy, minutes). The loop reads it before every wait,
// so a saved change applies from the next wait without a restart. Every part of the loop is mocked as in
// etsyImportLoop.importOrder.test.js; the setting is a value the test changes.
const state = vi.hoisted(() => ({ minutes: undefined, tick: null }));

vi.mock("./etsyHandlers.js", () => ({ getEtsyParts: () => ({ credentials: { status: () => ({ connected: true, shopId: 777 }) }, client: {} }) }));
vi.mock("../helpers/getSettings.js", () => ({
  getSettings: () => ({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY", etsyImportIntervalMin: state.minutes }),
  getEtsyImportSince: () => null,
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => "C:\\storage" }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}), getFeature: () => true }));
vi.mock("../helpers/db.js", () => ({
  isDbOpen: () => true,
  getAllFabrics: () => [],
  getEtsyFabricMap: () => [],
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
vi.mock("../helpers/etsyImport.js", () => ({ createEtsyImporter: () => state.tick }));

import { startEtsyImportLoop, etsyImportIntervalMs } from "./etsyImportLoop.js";

const MIN = 60 * 1000;
const SUMMARY = { ran: true, reason: null, imported: 0, needsReview: 0, failed: 0, skipped: 0 };
let stop = null;

beforeEach(() => {
  vi.useFakeTimers();
  state.minutes = undefined;
  state.tick = vi.fn(async () => SUMMARY);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe("etsyImportIntervalMs - the setting, clamped", () => {
  it("a station that never saved the field waits the default 2 minutes", () => {
    expect(etsyImportIntervalMs()).toBe(2 * MIN);
  });

  it("the saved minutes, never under 2 and never over 60", () => {
    state.minutes = 5;
    expect(etsyImportIntervalMs()).toBe(5 * MIN);
    state.minutes = 1;
    expect(etsyImportIntervalMs()).toBe(2 * MIN);
    state.minutes = 600;
    expect(etsyImportIntervalMs()).toBe(60 * MIN);
  });
});

describe("the loop waits the setting of the moment", () => {
  it("first tick after a minute, then one every saved interval", async () => {
    state.minutes = 5;
    stop = startEtsyImportLoop({ isPaused: () => false });
    await vi.advanceTimersByTimeAsync(MIN - 1);
    expect(state.tick).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MIN - 1);
    expect(state.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.tick).toHaveBeenCalledTimes(2);
  });

  it("a change saved between two ticks sets the wait after the next tick - no restart", async () => {
    state.minutes = 10;
    stop = startEtsyImportLoop({ isPaused: () => false });
    await vi.advanceTimersByTimeAsync(MIN); // tick 1, the next wait is booked at 10 min
    expect(state.tick).toHaveBeenCalledTimes(1);
    state.minutes = 2;
    await vi.advanceTimersByTimeAsync(10 * MIN); // tick 2 at the old pace, then the new one is read
    expect(state.tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(state.tick).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(state.tick).toHaveBeenCalledTimes(4);
  });

  it("a tick that throws still books the next one", async () => {
    state.minutes = 3;
    state.tick = vi.fn(async () => {
      throw new Error("share gone");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    stop = startEtsyImportLoop({ isPaused: () => false });
    await vi.advanceTimersByTimeAsync(MIN);
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(state.tick).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("stopped: no further tick, also not from a tick that was running at the stop", async () => {
    state.minutes = 2;
    let finish;
    state.tick = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(SUMMARY);
        }),
    );
    stop = startEtsyImportLoop({ isPaused: () => false });
    await vi.advanceTimersByTimeAsync(MIN); // tick 1 starts and hangs
    expect(state.tick).toHaveBeenCalledTimes(1);
    stop();
    stop = null;
    finish();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(state.tick).toHaveBeenCalledTimes(1);
  });
});
