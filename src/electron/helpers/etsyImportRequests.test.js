import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests, manualXwdOf } from "./etsyImportRequests.js";

// The Inbox bar's three calls (plan E4) on injected parts: the feature gate, the key and number checks, and
// the immediate tick that only the importer station starts.

const LINE = { receiptId: "3456789012", transactionId: "501" };

const make = (over = {}) => {
  const parts = {
    featureOn: vi.fn(() => true),
    isImporter: vi.fn(() => false),
    list: vi.fn(() => [{ ...LINE, state: "needs_review" }]),
    requestRetry: vi.fn(() => ({ updated: true })),
    dismiss: vi.fn(() => ({ updated: true })),
    requestTick: vi.fn(),
    ...over,
  };
  return { parts, requests: createEtsyImportRequests(parts) };
};

describe("the feature gate (fail closed)", () => {
  it.each(["list", "retry", "dismiss"])("%s refuses with features.etsy off and touches nothing", (call) => {
    const { parts, requests } = make({ featureOn: () => false });
    const out = requests[call]({ ...LINE, xwd: "173706" });
    expect(out).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(parts.list).not.toHaveBeenCalled();
    expect(parts.requestRetry).not.toHaveBeenCalled();
    expect(parts.dismiss).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("answers the rows and whether this station is the importer", () => {
    const { requests } = make({ isImporter: () => true });
    expect(requests.list()).toEqual({ success: true, data: [{ ...LINE, state: "needs_review" }], importerHere: true });
  });

  it("a table that could not be read is an error, never an empty bar", () => {
    const { requests } = make({ list: () => null });
    expect(requests.list()).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });
});

describe("retry", () => {
  it.each([
    ["five digits", "17370"],
    ["seven digits", "1737061"],
    ["the XWD prefix", "XWD173706"],
    ["a number", 173706],
  ])("a number that is not six digits as text (%s) is refused before any write", (_label, xwd) => {
    const { parts, requests } = make();
    expect(requests.retry({ ...LINE, xwd })).toMatchObject({ success: false, error: { code: "INVALID_XWD" } });
    expect(parts.requestRetry).not.toHaveBeenCalled();
  });

  it("six digits (spaces around trimmed) are written as the typed number", () => {
    const { parts, requests } = make();
    expect(requests.retry({ ...LINE, xwd: " 173706 " })).toEqual({ success: true, updated: true, importerHere: false });
    expect(parts.requestRetry).toHaveBeenCalledWith({ ...LINE, manualXwd: "173706" });
  });

  it("no number (null, empty) is a retry of the line as it is", () => {
    for (const xwd of [null, undefined, "", "  "]) {
      const { parts, requests } = make();
      requests.retry({ ...LINE, xwd });
      expect(parts.requestRetry).toHaveBeenCalledWith({ ...LINE, manualXwd: null });
    }
  });

  it("a line key that is not two digit strings is refused", () => {
    for (const bad of [{}, { receiptId: "1" }, { receiptId: "1; DROP", transactionId: "2" }, { receiptId: 1, transactionId: 2 }, null]) {
      const { parts, requests } = make();
      expect(requests.retry(bad)).toMatchObject({ success: false, error: { code: "INVALID_ETSY_LINE" } });
      expect(parts.requestRetry).not.toHaveBeenCalled();
    }
  });

  it("on the importer station a written request starts a tick at once; elsewhere it does not", () => {
    const here = make({ isImporter: () => true });
    expect(here.requests.retry(LINE)).toMatchObject({ success: true, importerHere: true });
    expect(here.parts.requestTick).toHaveBeenCalledTimes(1);

    const elsewhere = make();
    elsewhere.requests.retry(LINE);
    expect(elsewhere.parts.requestTick).not.toHaveBeenCalled();
  });

  it("a guard that matched no row is updated:false (not an error) and starts no tick", () => {
    const { parts, requests } = make({ isImporter: () => true, requestRetry: () => ({ updated: false }) });
    expect(requests.retry(LINE)).toEqual({ success: true, updated: false, importerHere: true });
    expect(parts.requestTick).not.toHaveBeenCalled();
  });

  it("a write that failed is an error", () => {
    const { requests } = make({ requestRetry: () => null });
    expect(requests.retry(LINE)).toMatchObject({ success: false, error: { code: "DB_WRITE_FAILED" } });
  });
});

describe("dismiss", () => {
  it("writes the key only", () => {
    const { parts, requests } = make();
    expect(requests.dismiss({ ...LINE, xwd: "173706" })).toEqual({ success: true, updated: true });
    expect(parts.dismiss).toHaveBeenCalledWith(LINE);
  });

  it("a failed write is an error, a guard miss is updated:false", () => {
    expect(make({ dismiss: () => null }).requests.dismiss(LINE)).toMatchObject({ success: false, error: { code: "DB_WRITE_FAILED" } });
    expect(make({ dismiss: () => ({ updated: false }) }).requests.dismiss(LINE)).toEqual({ success: true, updated: false });
  });
});

describe("manualXwdOf", () => {
  it("is the one reading of the typed number", () => {
    expect(manualXwdOf("000123")).toBe("000123");
    expect(manualXwdOf(null)).toBeNull();
    const fullWidth = String.fromCharCode(0xff11, 0xff12, 0xff13, 0xff14, 0xff15, 0xff16); // full-width 1..6 are not \d
    expect(() => manualXwdOf(fullWidth)).toThrow(/six digits/);
  });
});

describe("openListing (E4b)", () => {
  it("opens the public listing page built from the digits only", async () => {
    const openExternal = vi.fn(async () => {});
    const { requests } = make({ openExternal });
    expect(await requests.openListing(" 1234567890 ")).toEqual({ success: true });
    expect(openExternal).toHaveBeenCalledWith("https://www.etsy.com/listing/1234567890");
  });

  it.each(["", "12ab", "1/../2", "https://evil.example", 42, null])("refuses %j and opens nothing", async (value) => {
    const openExternal = vi.fn(async () => {});
    const { requests } = make({ openExternal });
    expect(await requests.openListing(value)).toMatchObject({ success: false, error: { code: "INVALID_ETSY_LISTING" } });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("refuses with features.etsy off, like every call of the bar", async () => {
    const openExternal = vi.fn(async () => {});
    const { requests } = make({ featureOn: () => false, openExternal });
    expect(await requests.openListing("1234567890")).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("a browser that cannot be started is an error answer, not a throw", async () => {
    const { requests } = make({ openExternal: async () => { throw new Error("no browser"); } });
    expect(await requests.openListing("1234567890")).toMatchObject({ success: false });
  });
});
