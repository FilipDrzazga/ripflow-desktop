import { describe, it, expect } from "vitest";
import { printFiltersHiding, matchesTabAndSearch } from "./printFilters";

const item = {
  id: "g_job1",
  materialType: "Cottons",
  printTypeCode: "LM",
  orderId: "ON100001",
  customerName: "Ada Lovelace",
  material: "Cotton 220",
};

const none = { activeTab: "All", searchQuery: "", printTypeFilter: [] };

describe("printFiltersHiding: which filters keep a file off the Print list", () => {
  it("nothing hides a file when no filter is on", () => {
    expect(printFiltersHiding(item, none)).toEqual({ tab: false, search: false, printType: false });
  });

  it("the material tab hides a file of the other class - and only the tab is blamed", () => {
    expect(printFiltersHiding(item, { ...none, activeTab: "Polyesters" })).toEqual({ tab: true, search: false, printType: false });
    expect(printFiltersHiding(item, { ...none, activeTab: "Cottons" }).tab).toBe(false);
  });

  it("the search box hides a file it does not match, case-insensitively and trimmed", () => {
    expect(printFiltersHiding(item, { ...none, searchQuery: "  zed " })).toEqual({ tab: false, search: true, printType: false });
    expect(printFiltersHiding(item, { ...none, searchQuery: "  ADA " }).search).toBe(false);
    expect(printFiltersHiding(item, { ...none, searchQuery: "on100001" }).search).toBe(false);
  });

  it("the type chips hide a file of another type; an empty chip list hides nothing", () => {
    expect(printFiltersHiding(item, { ...none, printTypeFilter: ["POSTER"] })).toEqual({ tab: false, search: false, printType: true });
    expect(printFiltersHiding(item, { ...none, printTypeFilter: ["POSTER", "LM"] }).printType).toBe(false);
  });

  it("names every filter that is in the way, independently", () => {
    expect(printFiltersHiding(item, { activeTab: "Polyesters", searchQuery: "zed", printTypeFilter: ["POSTER"] })).toEqual({
      tab: true,
      search: true,
      printType: true,
    });
  });

  it("agrees with the list's own condition: a file is hidden by the tab/search part exactly when matchesTabAndSearch says no", () => {
    for (const activeTab of ["All", "Cottons", "Polyesters"]) {
      for (const query of ["", "ada", "zed"]) {
        const h = printFiltersHiding(item, { activeTab, searchQuery: query, printTypeFilter: [] });
        expect(h.tab || h.search, `${activeTab}/${query}`).toBe(!matchesTabAndSearch(item, activeTab, query));
      }
    }
  });
});
