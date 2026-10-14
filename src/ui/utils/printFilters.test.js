import { describe, it, expect } from "vitest";
import { matchesTabAndSearch, countByPrintType, activeFilterCount } from "./printFilters.js";

// The Print view's Filter panel: the tab + search condition shared with the store, and the
// per-type counts on the chips.

const item = (over) => ({ materialType: "Cottons", printTypeCode: "LM", orderId: "1001", customerName: "Ann", material: "Linen", ...over });
const FILES = [
  { items: [item({ printTypeCode: "LM" }), item({ printTypeCode: "FQ", orderId: "2002" })] },
  { items: [item({ materialType: "Polyesters", printTypeCode: "LM", customerName: "Bob" }), item({ printTypeCode: "CUSHION" })] },
];

describe("matchesTabAndSearch", () => {
  it("All lets every material through; a class tab only its own", () => {
    expect(matchesTabAndSearch(item(), "All", "")).toBe(true);
    expect(matchesTabAndSearch(item(), "Cottons", "")).toBe(true);
    expect(matchesTabAndSearch(item(), "Polyesters", "")).toBe(false);
  });

  it("the query matches order id, customer or material (already lower-cased by the caller)", () => {
    expect(matchesTabAndSearch(item(), "All", "100")).toBe(true);
    expect(matchesTabAndSearch(item(), "All", "ann")).toBe(true);
    expect(matchesTabAndSearch(item(), "All", "linen")).toBe(true);
    expect(matchesTabAndSearch(item(), "All", "zzz")).toBe(false);
  });

  it("missing fields never throw and never match", () => {
    expect(matchesTabAndSearch({ materialType: "Cottons" }, "All", "a")).toBe(false);
  });
});

describe("countByPrintType", () => {
  it("counts every type of the current tab", () => {
    expect(countByPrintType(FILES, "All", "")).toEqual({ LM: 2, FQ: 1, CUSHION: 1 });
    expect(countByPrintType(FILES, "Cottons", "")).toEqual({ LM: 1, FQ: 1, CUSHION: 1 });
  });

  it("follows the search, trimmed and case-blind like the list", () => {
    expect(countByPrintType(FILES, "All", "  BOB ")).toEqual({ LM: 1 });
    expect(countByPrintType(FILES, "All", "2002")).toEqual({ FQ: 1 });
  });

  it("no files / no items: an empty map", () => {
    expect(countByPrintType(null, "All", "")).toEqual({});
    expect(countByPrintType([{}], "All", undefined)).toEqual({});
  });
});

describe("activeFilterCount", () => {
  it("each picked type counts, the sort counts once when on", () => {
    expect(activeFilterCount([], null)).toBe(0);
    expect(activeFilterCount(["LM", "FQ"], null)).toBe(2);
    expect(activeFilterCount(["LM"], "meters_desc")).toBe(2);
    expect(activeFilterCount([], "date_asc")).toBe(1);
  });
});
