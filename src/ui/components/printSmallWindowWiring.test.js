import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for the small-window layout of Print and Production (FILIP 2026-10-16): the rules that keep it are pinned by reading the sources.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const app = read("../App.jsx");
const pillCss = read("./InboxWatchPill/InboxWatchPill.module.css");
const filtersCss = read("./DataFilters/DataFilters.module.css");
const productionCss = read("./Production/Production.module.css");
const cardsCss = {
  inbox: read("./DataOverviewSection/ProductionOverviewCard/ProductionOverviewCard.module.css"),
  materials: read("./DataOverviewSection/PrintMaterialBreakdownCard/PrintMaterialBreakdownCard.module.css"),
  lastBatch: read("./OverviewPanel/OverviewPanel.module.css"),
};

// The text of an @media block (from its opening brace to the matching closing one).
const mediaBlock = (css, condition) => {
  const at = css.indexOf(`@media (${condition}) {`);
  expect(at, `@media (${condition}) exists`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
  }
  throw new Error(`@media (${condition}) is not closed`);
};

describe("Print view: the new-files pill floats over the top of the list", () => {
  it("sits between the filters and the list, after the overview cards (FILIP 2026-10-16 10:12)", () => {
    const view = app.slice(app.indexOf("styles.print_view"));
    const at = (needle) => view.indexOf(needle);
    expect(at("<DataOverviewSection")).toBeGreaterThan(-1);
    expect(at("<DataOverviewSection")).toBeLessThan(at("<DataFilters />"));
    expect(at("<DataFilters />")).toBeLessThan(at("<InboxWatchPill />"));
    expect(at("<InboxWatchPill />")).toBeLessThan(at("<DataList />"));
  });

  it("takes no room: a zero-height sticky anchor, no negative margin, nothing added to the filters", () => {
    expect(pillCss).toMatch(/\.anchor \{[^}]*position: sticky;[^}]*height: 0;/s);
    expect(pillCss).not.toMatch(/\.anchor \{[^}]*margin-bottom/s);
    expect(filtersCss).not.toMatch(/\.filters_container \{[^}]*margin-bottom/s);
  });
});

describe("Print view: two by two up to 1440 px pairs the material cards, then Inbox with Last batch", () => {
  it.each([
    ["materials", "order: 0;"],
    ["inbox", "order: 1;"],
    ["lastBatch", "order: 2;"],
  ])("%s card has %s inside the 1440 px block", (name, order) => {
    expect(mediaBlock(cardsCss[name], "max-width: 1440px")).toContain(order);
  });

  it("sets no order outside the 1440 px block (four across keeps the DOM order)", () => {
    for (const css of Object.values(cardsCss)) {
      const outside = css.replace(mediaBlock(css, "max-width: 1440px"), "");
      expect(outside).not.toMatch(/\border:/);
    }
  });
});

describe("small windows keep the filter row and the stage row on one line", () => {
  it("Print search bar is narrower at <= 1100 px", () => {
    expect(mediaBlock(filtersCss, "max-width: 1100px")).toMatch(/\.search_wrapper \{[^}]*width: 190px;/s);
  });

  it("Production stage numbers are smaller and the tabs tighter at <= 1100 px", () => {
    const block = mediaBlock(productionCss, "max-width: 1100px");
    expect(block).toMatch(/\.stage_tab_count \{[^}]*font-size: 17px;/s);
    expect(block).toMatch(/\.stage_tab \{[^}]*padding: 8px 9px 10px;/s);
  });
});
