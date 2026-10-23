import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests, listingPrintTypeOf } from "./etsyImportRequests.js";

// Plan FAB-3c: remembering the print type of a listing from the bar. The listing comes from the row; the code must be
// one of ETSY_LISTING_PRINT_TYPES exactly as spelled.

const LINE = { receiptId: "3456789012", transactionId: "501" };
const ROW = { ...LINE, state: "needs_review", listingId: "1351273307" };

const make = (over = {}) => {
  const parts = {
    saveListingType: vi.fn(() => true),
    forgetListingType: vi.fn(() => ({ deleted: true })),
    listListingTypes: vi.fn(() => [{ listingId: "1351273307", printType: "SNOOD" }]),
    getLine: vi.fn(() => ROW),
    ...over,
  };
  const requests = createEtsyImportRequests({
    featureOn: () => true,
    isImporter: () => false,
    list: () => [],
    requestRetry: () => ({ updated: true }),
    dismiss: () => ({ updated: true }),
    requestTick: () => {},
    ...parts,
  });
  return { requests, parts };
};

describe("listingPrintTypeOf", () => {
  it.each([["SNOOD"], ["APRON"]])("%s passes", (code) => {
    expect(listingPrintTypeOf(code)).toBe(code);
  });

  it.each([
    ["another type of the shop", "TEA_TOWEL"],
    ["the label instead of the code", "Snood"],
    ["lower case", "snood"],
    ["a prototype key", "constructor"],
    ["a number", 5],
    ["nothing", null],
    ["empty", ""],
  ])("refuses %s", (_label, value) => {
    expect(() => listingPrintTypeOf(value)).toThrow(expect.objectContaining({ code: "INVALID_PRINT_TYPE", type: "Warning" }));
  });
});

describe("setListingPrintType", () => {
  it("remembers the type for the listing of the line, read off the row", () => {
    const { requests, parts } = make();
    expect(requests.setListingPrintType({ ...LINE, printType: "APRON", listingId: "999" })).toEqual({ success: true, listingId: "1351273307" });
    expect(parts.saveListingType).toHaveBeenCalledWith({ listingId: "1351273307", printType: "APRON" });
  });

  it.each(["needs_review", "failed", "retry"])("accepts a %s line", (state) => {
    const { requests } = make({ getLine: () => ({ ...ROW, state }) });
    expect(requests.setListingPrintType({ ...LINE, printType: "SNOOD" }).success).toBe(true);
  });

  it.each(["done", "pending", "dismissed"])("refuses a %s line - nothing written", (state) => {
    const { requests, parts } = make({ getLine: () => ({ ...ROW, state }) });
    expect(requests.setListingPrintType({ ...LINE, printType: "SNOOD" })).toMatchObject({ success: false, error: { code: "ETSY_LINE_CLOSED" } });
    expect(parts.saveListingType).not.toHaveBeenCalled();
  });

  it.each([
    ["a line that is not in the table", null, "ETSY_LINE_GONE"],
    ["a line with no listing", { ...ROW, listingId: null }, "NO_ETSY_LISTING"],
  ])("refuses %s", (_label, row, code) => {
    const { requests, parts } = make({ getLine: () => row });
    expect(requests.setListingPrintType({ ...LINE, printType: "SNOOD" })).toMatchObject({ success: false, error: { code } });
    expect(parts.saveListingType).not.toHaveBeenCalled();
  });

  it("refuses a type that cannot be chosen before looking at the row", () => {
    const { requests, parts } = make();
    expect(requests.setListingPrintType({ ...LINE, printType: "TEA_TOWEL" })).toMatchObject({ success: false, error: { code: "INVALID_PRINT_TYPE" } });
    expect(parts.getLine).not.toHaveBeenCalled();
  });

  it("a write that failed is an error, not a quiet success", () => {
    const { requests } = make({ saveListingType: () => null });
    expect(requests.setListingPrintType({ ...LINE, printType: "SNOOD" })).toMatchObject({ success: false, error: { code: "DB_WRITE_FAILED" } });
  });

  it("is refused while features.etsy is off", () => {
    const { parts } = make();
    const off = createEtsyImportRequests({ featureOn: () => false, isImporter: () => false, list: () => [], requestRetry: () => null, dismiss: () => null, requestTick: () => {}, ...parts });
    expect(off.setListingPrintType({ ...LINE, printType: "SNOOD" })).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(parts.saveListingType).not.toHaveBeenCalled();
  });
});

describe("listingPrintTypes / forgetListingPrintType", () => {
  it("lists what is remembered as { listingId: code }", () => {
    const { requests } = make();
    expect(requests.listingPrintTypes()).toEqual({ success: true, data: { 1351273307: "SNOOD" } });
  });

  it("a table that could not be read is an error, never an empty answer", () => {
    const { requests } = make({ listListingTypes: () => null });
    expect(requests.listingPrintTypes()).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });

  it("forgets a listing named by its digits", () => {
    const { requests, parts } = make();
    expect(requests.forgetListingPrintType(" 1351273307 ")).toEqual({ success: true, deleted: true });
    expect(parts.forgetListingType).toHaveBeenCalledWith("1351273307");
  });

  it.each([["abc"], [""], [5], [null]])("refuses %j as a listing", (value) => {
    const { requests, parts } = make();
    expect(requests.forgetListingPrintType(value)).toMatchObject({ success: false, error: { code: "INVALID_ETSY_LISTING" } });
    expect(parts.forgetListingType).not.toHaveBeenCalled();
  });
});
