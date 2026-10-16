import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the click-to-refresh tile is pinned by reading the sources (see cloudMetresWiring.test.js).

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const overview = read("./OverviewPanel/OverviewPanel.jsx");
const css = read("./OverviewPanel/OverviewPanel.module.css");
const hook = read("../hooks/useCloudDayMetres.js");

describe("Printed metres tile - badge, unit and click to refresh", () => {
  it("there is no refresh button: the whole tile is the click target", () => {
    expect(overview).not.toMatch(/LuRefreshCw/);
    expect(overview).not.toMatch(/Refresh printed metres/);
    const block = overview.match(/<div\s+className=\{style\.metres\}([\s\S]*?)>\s*<div className=\{style\.metres_head\}/)[1];
    expect(block).toMatch(/onClick=\{cloud\.reload\}/);
    expect(block).toMatch(/role="button"/);
    expect(block).toMatch(/tabIndex=\{0\}/);
  });

  it("a click on a Copy button does not also refresh the tile", () => {
    expect(overview).toMatch(/e\.stopPropagation\(\);\s*copyDay\(field, keyField\);/);
  });

  it("the column heads say Yesterday and Today with no date in the text", () => {
    expect(overview).not.toMatch(/\{label\} \{dayHeading/);
    expect(overview).toMatch(/title=\{`\$\{label\} \$\{dayHeading\(cloud\.data\[keyField\]\)\}`\}/);
  });

  it("the machine is a printer badge in the profile colours, and the numbers carry the unit", () => {
    expect(overview).toMatch(/deviceBadges\(/);
    expect(overview).toMatch(/getPrinterColor\(shopProfile, badge\.code\)/);
    expect(overview).toMatch(/metresLabel\(device\.yesterday\)/);
    expect(overview).toMatch(/metresLabel\(device\.today\)/);
    expect(overview).not.toMatch(/metresCell/);
  });

  it("the copy text is still unit-free (it goes into a sheet)", () => {
    const text = read("../utils/cloudMetresText.js");
    expect(text).toMatch(/\$\{device\.name\}\\t\$\{formatMetres\(device\[field\]\.metres\)\}/);
  });

  it("hover lights up the whole tile, and the sticky heads follow its colour", () => {
    expect(css).toMatch(/\.metres:hover,/);
    expect(css).toMatch(/\.metres:hover \.metres_colhead/);
  });

  it("the tile says it is reading while a click is answered", () => {
    expect(hook).toMatch(/refreshing/);
    expect(overview).toMatch(/cloud\.refreshing/);
  });
});
