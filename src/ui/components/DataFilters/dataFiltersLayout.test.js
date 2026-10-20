import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the Filter button sits in the right group, left of the search bar, and the active
// filters are chips right before it (FILIP 2026-10-20 12:23 and 12:54, option A).

const jsx = readFileSync(fileURLToPath(new URL("./DataFilters.jsx", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("./DataFilters.module.css", import.meta.url)), "utf8");

describe("Print filter row", () => {
  const rightGroup = jsx.indexOf("styles.right_group");
  const chips = jsx.indexOf("styles.active_chips");
  const filterButton = jsx.indexOf("styles.sort_wrapper");
  const search = jsx.indexOf("styles.search_wrapper");
  const refresh = jsx.indexOf("styles.refresh_button");
  const lastTab = jsx.indexOf("classTabs.map");

  it("the right group reads: chips, Filter button, search bar, Refresh", () => {
    expect(rightGroup).toBeGreaterThan(lastTab);
    expect(chips).toBeGreaterThan(rightGroup);
    expect(filterButton).toBeGreaterThan(chips);
    expect(search).toBeGreaterThan(filterButton);
    expect(refresh).toBeGreaterThan(search);
  });

  it("the tabs have the left side to themselves: no chips and no separator before the right group", () => {
    expect(jsx.slice(lastTab, rightGroup)).not.toContain("active_chip");
    expect(jsx).not.toContain("filter_separator");
  });
});

describe("a narrow window folds the chips behind the Filter button into +N", () => {
  it("chips from the third on are hidden and the +N chip is shown, at <= 1100 px only", () => {
    const at = css.lastIndexOf("@media (max-width: 1100px) {");
    const block = css.slice(at);
    expect(block).toMatch(/\.chip_extra \{[^}]*display: none;/s);
    expect(block).toMatch(/\.chips_more \{[^}]*display: flex;/s);
    expect(css.slice(0, at)).toMatch(/\.chips_more \{[^}]*display: none;/s);
  });

  it("the chip row never wraps inside the right group", () => {
    expect(css).toMatch(/\.active_chips \{[^}]*flex-wrap: nowrap;/s);
  });

  it("the number folded away is what the +N chip shows", () => {
    expect(jsx).toMatch(/hiddenChipCount = Math\.max\(0, \(sortOrder \? 1 : 0\) \+ activeTypeOptions\.length - CHIPS_WHEN_NARROW\)/);
    expect(jsx).toMatch(/\(sortOrder \? 1 : 0\) \+ i >= CHIPS_WHEN_NARROW/);
  });
});
