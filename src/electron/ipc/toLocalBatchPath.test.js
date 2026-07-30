import { describe, it, expect, vi } from "vitest";

// toLocalBatchPath is a pure function, but it lives in productionHandlers.js whose
// module graph pulls electron plus the native better-sqlite3 / electron-store chain
// (db.js, getSettings.js, labelPrinter.js). Neutralize ONLY those infrastructure
// leaks so the module can load in the node test env — same convention as
// normalizeOverrideEntry.test.js. The only mock the function under test actually
// reads is getStorageRootPath; the rest exist purely to let the import resolve.
vi.mock("electron", () => ({ ipcMain: { handle: () => {} } }));
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
vi.mock("../helpers/labelPrinter.js", () => ({ printBatchLabel: () => ({ success: true }) }));
vi.mock("../helpers/getRootPath.js", () => ({
  getStorageRootPath: () => "O:\\SPPrintReadyArtwork",
}));

import { toLocalBatchPath } from "./productionHandlers.js";

const LOCAL = "O:\\SPPrintReadyArtwork\\PRINTED\\29-06-2026\\PRINTED_095958-Drill-DGEN";
const UNC = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\PRINTED\\29-06-2026\\PRINTED_095958-Drill-DGEN";

describe("toLocalBatchPath — re-root a DB batch_path on this station's storage root", () => {
  it("rewrites a UNC path onto the local root, keeping day + batch folder", () => {
    expect(toLocalBatchPath(UNC)).toBe(LOCAL);
  });

  it("leaves an already-local path untouched (idempotent on the common case)", () => {
    expect(toLocalBatchPath(LOCAL)).toBe(LOCAL);
  });

  it("is idempotent — a second call over its own output changes nothing", () => {
    const once = toLocalBatchPath(UNC);
    expect(toLocalBatchPath(once)).toBe(once);
    expect(once).toBe(LOCAL);
  });

  it("does not mistake the PRINTED_HHMMSS batch folder for the PRINTED segment", () => {
    // A naive startsWith/includes scan from the end would latch onto
    // "PRINTED_095958-Drill-DGEN" and re-root one level too deep.
    expect(toLocalBatchPath(UNC)).toBe(LOCAL);
    // Same trap without a real PRINTED segment: the only PRINTED* token IS the batch
    // folder, so there is nothing to rewrite.
    const batchOnly = "O:\\SPPrintReadyArtwork\\PRINTED_095958-Drill-DGEN";
    expect(toLocalBatchPath(batchOnly)).toBe(batchOnly);
  });

  it("matches the segment case-insensitively (Windows paths are)", () => {
    const lower = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\printed\\29-06-2026\\PRINTED_095958-Drill-DGEN";
    expect(toLocalBatchPath(lower)).toBe(LOCAL);
  });

  it("returns the input unchanged when there is no PRINTED segment at all", () => {
    const noPrinted = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\ARCHIVE\\29-06-2026\\PRINTED_095958-Drill-DGEN";
    expect(toLocalBatchPath(noPrinted)).toBe(noPrinted);
  });

  it("returns the input unchanged when only ONE segment follows PRINTED", () => {
    const shortTail = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\PRINTED\\29-06-2026";
    expect(toLocalBatchPath(shortTail)).toBe(shortTail);
  });

  it("returns the input unchanged when THREE segments follow PRINTED", () => {
    const longTail = `${UNC}\\somefile.pdf`;
    expect(toLocalBatchPath(longTail)).toBe(longTail);
  });

  it("refuses a '..' traversal segment in the day position", () => {
    const traversal = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\PRINTED\\..\\29-06-2026";
    expect(toLocalBatchPath(traversal)).toBe(traversal);
  });

  it("refuses a '..' traversal segment in the batch position", () => {
    const traversal = "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork\\PRINTED\\29-06-2026\\..";
    expect(toLocalBatchPath(traversal)).toBe(traversal);
  });

  it("tolerates a trailing separator", () => {
    expect(toLocalBatchPath(`${UNC}\\`)).toBe(LOCAL);
  });

  it("returns null / undefined / empty / blank input unchanged, without throwing", () => {
    expect(() => toLocalBatchPath(null)).not.toThrow();
    expect(toLocalBatchPath(null)).toBeNull();
    expect(toLocalBatchPath(undefined)).toBeUndefined();
    expect(toLocalBatchPath("")).toBe("");
    expect(toLocalBatchPath("   ")).toBe("   ");
  });

  it("returns a non-string input unchanged, without throwing", () => {
    expect(() => toLocalBatchPath(42)).not.toThrow();
    expect(toLocalBatchPath(42)).toBe(42);
  });
});
