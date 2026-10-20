import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the Filter button sits in the right group, left of the search bar (FILIP 2026-10-20 12:23).

const jsx = readFileSync(fileURLToPath(new URL("./DataFilters.jsx", import.meta.url)), "utf8");

describe("Print filter row", () => {
  const rightGroup = jsx.indexOf("styles.right_group");
  const filterButton = jsx.indexOf("styles.sort_wrapper");
  const search = jsx.indexOf("styles.search_wrapper");
  const refresh = jsx.indexOf("styles.refresh_button");
  const chips = jsx.indexOf("styles.active_chips");
  const lastTab = jsx.indexOf("classTabs.map");

  it("the Filter button is inside the right group, between the tabs' side and the search bar", () => {
    expect(rightGroup).toBeGreaterThan(-1);
    expect(filterButton).toBeGreaterThan(rightGroup);
    expect(filterButton).toBeLessThan(search);
    expect(search).toBeLessThan(refresh);
  });

  it("the tabs and the active-filter chips stay on the left, before the right group", () => {
    expect(lastTab).toBeLessThan(chips);
    expect(chips).toBeLessThan(rightGroup);
  });

  it("the separator is only drawn together with the chips", () => {
    const separator = jsx.indexOf("styles.filter_separator");
    expect(separator).toBeGreaterThan(jsx.indexOf("filterCount > 0 && ("));
    expect(separator).toBeLessThan(chips);
  });
});
