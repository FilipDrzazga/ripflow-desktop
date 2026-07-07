import { describe, it, expect, vi } from "vitest";

// normalizeOverrideEntry is a pure function, but it lives in readPrintedFolder.js
// whose module graph pulls the native better-sqlite3 / electron-store chain
// (db.js + getRootPath.js → getSettings.js). Neutralize ONLY those infrastructure
// leaks so the module can load in the node test env — same convention as
// fabricCache.test.js. Neither mocked function is ever called by the function
// under test; the mocks exist purely to let the import resolve.
vi.mock("../helpers/db.js", () => ({
  getOpenReprintRequestsByFileIds: () => [],
  getAllFabrics: () => [],
  getFabricGlobals: () => ({}),
}));
vi.mock("../helpers/getRootPath.js", () => ({
  getStorageRootPath: () => "O:\\SPPrintReadyArtwork",
}));

import { normalizeOverrideEntry } from "./readPrintedFolder.js";

describe("normalizeOverrideEntry — single shape gate (new {printed} + legacy)", () => {
  it("returns null for undefined", () => {
    expect(normalizeOverrideEntry(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(normalizeOverrideEntry(null)).toBeNull();
  });

  it("passes an object with neither printed nor qty/meters through to null", () => {
    // final return branch — a malformed/empty entry must not become a phantom override
    expect(normalizeOverrideEntry({})).toBeNull();
  });

  it("normalizes the new LM shape (printed.meters) and carries reprint provenance", () => {
    const result = normalizeOverrideEntry({
      printed: { meters: 12.5 },
      manual: true,
      reprintQty: 12.5,
      reprintOriginal: 40,
    });
    expect(result).toEqual({
      printed: { meters: 12.5 },
      manual: true,
      reprintQty: 12.5,
      reprintOriginal: 40,
    });
    expect(result.printed.meters).toBe(12.5);
  });

  it("normalizes the new non-LM shape (printed.qty) and keeps manual:false as false", () => {
    // manual === true gate: a pure reprint (manual:false) must stay false
    const result = normalizeOverrideEntry({
      printed: { qty: 3 },
      manual: false,
      reprintQty: 3,
      reprintOriginal: 8,
    });
    expect(result.printed.qty).toBe(3);
    expect(result.printed.meters).toBeUndefined();
    expect(result.manual).toBe(false);
    expect(result.reprintQty).toBe(3);
    expect(result.reprintOriginal).toBe(8);
  });

  it("reads the legacy meters shape defensively as a manual override with no reprint", () => {
    const result = normalizeOverrideEntry({ meters: 12.5 });
    expect(result.printed.meters).toBe(12.5);
    expect(result.printed.qty).toBeUndefined();
    expect(result.manual).toBe(true);
    expect(result.reprintQty).toBeNull();
    expect(result.reprintOriginal).toBeNull();
  });

  it("reads the legacy qty shape defensively as a manual override with no reprint", () => {
    const result = normalizeOverrideEntry({ qty: 3 });
    expect(result.printed.qty).toBe(3);
    expect(result.printed.meters).toBeUndefined();
    expect(result.manual).toBe(true);
    expect(result.reprintQty).toBeNull();
    expect(result.reprintOriginal).toBeNull();
  });
});
