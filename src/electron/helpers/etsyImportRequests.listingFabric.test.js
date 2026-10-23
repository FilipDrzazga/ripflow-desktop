import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests, fabricNameOf } from "./etsyImportRequests.js";

// Plan FAB: remembering the fabric of a listing from the bar. The listing comes from the row, the name must be a
// row of the Fabrics catalogue to the character.

const has = (name) => name === "Drill" || name === "Active Eco Lycra";
const LINE = { receiptId: "3456789012", transactionId: "501" };
const ROW = { ...LINE, state: "needs_review", listingId: "1351273307" };

const make = (over = {}) => {
  const parts = {
    saveListingFabric: vi.fn(() => true),
    forgetListingFabric: vi.fn(() => ({ deleted: true })),
    listListingFabrics: vi.fn(() => [{ listingId: "1351273307", fabricName: "Active Eco Lycra" }]),
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
    hasFabric: has,
    ...parts,
  });
  return { requests, parts };
};

describe("fabricNameOf", () => {
  it("a catalogue name passes through untouched", () => {
    expect(fabricNameOf("Active Eco Lycra", has)).toBe("Active Eco Lycra");
  });

  it.each([
    ["no choice", null, "INVALID_FABRIC"],
    ["an empty string", "", "INVALID_FABRIC"],
    ["a number", 5, "INVALID_FABRIC"],
    ["an object", { name: "Drill" }, "INVALID_FABRIC"],
    ["a control character", `Dri${String.fromCharCode(7)}ll`, "INVALID_FABRIC"],
    ["a very long string", "D".repeat(201), "INVALID_FABRIC"],
    ["a name the catalogue does not have", "Velvet", "UNKNOWN_FABRIC"],
    ["the same name in another case", "drill", "UNKNOWN_FABRIC"],
    ["the name with a space around it", " Drill", "UNKNOWN_FABRIC"],
  ])("refuses %s", (_label, value, code) => {
    expect(() => fabricNameOf(value, has)).toThrow(expect.objectContaining({ code, type: "Warning" }));
  });
});

describe("setListingFabric", () => {
  it("remembers the fabric for the listing of the line, read off the row", () => {
    const { requests, parts } = make();
    expect(requests.setListingFabric({ ...LINE, fabric: "Active Eco Lycra" })).toEqual({ success: true, listingId: "1351273307" });
    expect(parts.getLine).toHaveBeenCalledWith("3456789012", "501");
    expect(parts.saveListingFabric).toHaveBeenCalledWith({ listingId: "1351273307", fabricName: "Active Eco Lycra" });
  });

  it("ignores a listing the renderer might send - the row decides", () => {
    const { requests, parts } = make();
    requests.setListingFabric({ ...LINE, fabric: "Drill", listingId: "999" });
    expect(parts.saveListingFabric).toHaveBeenCalledWith({ listingId: "1351273307", fabricName: "Drill" });
  });

  it.each(["needs_review", "failed", "retry"])("accepts a %s line", (state) => {
    const { requests } = make({ getLine: () => ({ ...ROW, state }) });
    expect(requests.setListingFabric({ ...LINE, fabric: "Drill" }).success).toBe(true);
  });

  it.each(["done", "pending", "dismissed"])("refuses a %s line - nothing written", (state) => {
    const { requests, parts } = make({ getLine: () => ({ ...ROW, state }) });
    const res = requests.setListingFabric({ ...LINE, fabric: "Drill" });
    expect(res).toMatchObject({ success: false, error: { code: "ETSY_LINE_CLOSED" } });
    expect(parts.saveListingFabric).not.toHaveBeenCalled();
  });

  it.each([
    ["a line that is not in the table", null, "ETSY_LINE_GONE"],
    ["a table that could not be asked", undefined, "ETSY_LINE_GONE"],
    ["a line with no listing", { ...ROW, listingId: null }, "NO_ETSY_LISTING"],
    ["a listing that is not digits", { ...ROW, listingId: "abc" }, "NO_ETSY_LISTING"],
  ])("refuses %s", (_label, row, code) => {
    const { requests, parts } = make({ getLine: () => row });
    expect(requests.setListingFabric({ ...LINE, fabric: "Drill" })).toMatchObject({ success: false, error: { code } });
    expect(parts.saveListingFabric).not.toHaveBeenCalled();
  });

  it("refuses an unknown fabric before looking at the row", () => {
    const { requests, parts } = make();
    expect(requests.setListingFabric({ ...LINE, fabric: "Velvet" })).toMatchObject({ success: false, error: { code: "UNKNOWN_FABRIC" } });
    expect(parts.getLine).not.toHaveBeenCalled();
    expect(parts.saveListingFabric).not.toHaveBeenCalled();
  });

  it("a write that failed is an error, not a quiet success", () => {
    const { requests } = make({ saveListingFabric: () => null });
    expect(requests.setListingFabric({ ...LINE, fabric: "Drill" })).toMatchObject({ success: false, error: { code: "DB_WRITE_FAILED" } });
  });

  it("is refused while features.etsy is off", () => {
    const { requests, parts } = make();
    const off = createEtsyImportRequests({ featureOn: () => false, isImporter: () => false, list: () => [], requestRetry: () => null, dismiss: () => null, requestTick: () => {}, ...parts, hasFabric: has });
    expect(off.setListingFabric({ ...LINE, fabric: "Drill" })).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(requests).toBeTruthy();
    expect(parts.saveListingFabric).not.toHaveBeenCalled();
  });

  it("with no catalogue answer wired in, every fabric is refused (fail closed)", () => {
    const { requests, parts } = make();
    const bare = createEtsyImportRequests({ featureOn: () => true, isImporter: () => false, list: () => [], requestRetry: () => null, dismiss: () => null, requestTick: () => {}, ...parts, hasFabric: undefined });
    expect(bare.setListingFabric({ ...LINE, fabric: "Drill" })).toMatchObject({ success: false, error: { code: "UNKNOWN_FABRIC" } });
    expect(requests).toBeTruthy();
  });
});

describe("listingFabrics / forgetListingFabric", () => {
  it("lists what is remembered as { listingId: fabricName }", () => {
    const { requests } = make();
    expect(requests.listingFabrics()).toEqual({ success: true, data: { 1351273307: "Active Eco Lycra" } });
  });

  it("a table that could not be read is an error, never an empty answer", () => {
    const { requests } = make({ listListingFabrics: () => null });
    expect(requests.listingFabrics()).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });

  it("forgets a listing named by its digits", () => {
    const { requests, parts } = make();
    expect(requests.forgetListingFabric(" 1351273307 ")).toEqual({ success: true, deleted: true });
    expect(parts.forgetListingFabric).toHaveBeenCalledWith("1351273307");
  });

  it.each([["abc"], [""], [5], [null]])("refuses %j as a listing", (value) => {
    const { requests, parts } = make();
    expect(requests.forgetListingFabric(value)).toMatchObject({ success: false, error: { code: "INVALID_ETSY_LISTING" } });
    expect(parts.forgetListingFabric).not.toHaveBeenCalled();
  });
});
