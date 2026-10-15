import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for Settings or the wizard (see cardContainerWiring.test.js): the narrow-window layout is pinned by
// reading the stylesheets and the one markup hook. A container query only matches when the element it measures
// declares the container by the same name - miss it and the query silently never applies.

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const fabrics = read("./views/FabricsView.module.css");
const fabricsJsx = read("./views/FabricsView.jsx");
const profileCss = read("./views/ShopProfileView.module.css");
const profileJsx = read("./views/ShopProfileView.jsx");
const wizard = read("../SetupWizard/SetupWizard.module.css");

const ruleBody = (css, selector) => {
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]);
  expect(bodies.length, `${selector} has a rule of its own`).toBeGreaterThan(0);
  return bodies.join("\n");
};

describe("Fabrics list takes one column when its pane is narrow", () => {
  // A query styles the descendants of its container, never the container itself: the container is the CARD, the rule restyles .mat_columns inside it.
  it("the query names the container .card_materials declares, and the card carries that class", () => {
    expect(fabrics).toMatch(/@container matlist \(max-width: 780px\)/);
    expect(ruleBody(fabrics, ".card_materials")).toContain("container: matlist / inline-size;");
    expect(fabricsJsx).toContain("styles.card_materials");
    expect(ruleBody(fabrics, ".mat_columns")).not.toContain("container:");
  });

  it("the narrow rule stacks the two columns", () => {
    const narrow = fabrics.slice(fabrics.indexOf("@container matlist"));
    expect(narrow).toContain("flex-direction: column;");
  });
});

describe("Shop Profile header wraps its buttons", () => {
  it("the header wraps and the text block has a basis of its own", () => {
    expect(ruleBody(profileCss, ".header")).toContain("flex-wrap: wrap;");
    expect(ruleBody(profileCss, ".header_text")).toContain("flex: 1 1 320px;");
    expect(profileJsx).toContain("own.header_text");
  });
});

describe("Shop Profile key/value grid lets its value column shrink", () => {
  it("the value column is minmax(0, 1fr), so long chips wrap inside the card instead of leaving it", () => {
    expect(ruleBody(profileCss, ".kv")).toContain("grid-template-columns: max-content minmax(0, 1fr);");
  });
});

describe("the wizard keeps its buttons in view in a short window", () => {
  it("below 720 px the step buttons stick to the bottom of the scrolling body", () => {
    const short = wizard.slice(wizard.indexOf("@media (max-height: 720px)"));
    expect(short).toContain("position: sticky;");
    expect(short).toContain("bottom: 0;");
    expect(short).toContain("background: var(--bg-white);");
  });

  it("the sticky rule is NOT outside the media query (a taller window is unchanged)", () => {
    expect(wizard.slice(0, wizard.indexOf("@media (max-height: 720px)"))).not.toContain("position: sticky;");
  });
});
