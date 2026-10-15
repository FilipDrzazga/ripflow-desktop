import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for the Production components (see rangeSelectWiring.test.js): the card layout is pinned by
// reading the stylesheets. A card changes its layout by the width of the LIST it sits in, so the list must be a
// container with the name the query asks for - miss it in one place and the query silently never matches there.

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const production = read("Production.module.css");
const receive = read("SewingReceive.module.css");

const ruleBody = (css, selector) => {
  // every rule that has exactly this selector (a selector can have a shared rule and one of its own)
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]);
  expect(bodies.length, `${selector} has a rule of its own`).toBeGreaterThan(0);
  return bodies.join("\n");
};

describe("Production card wraps by the width of its list", () => {
  it("the query names the container the lists declare", () => {
    expect(production).toMatch(/@container cards \(max-width: 1080px\)/);
    expect(production).toMatch(/@container cards \(max-width: 1000px\)/);
  });

  it("the Batches list (.cards_wrapper) is a size container named cards", () => {
    expect(ruleBody(production, ".cards_wrapper")).toContain("container: cards / inline-size;");
  });

  it("the Receive items column (.column) is a size container named cards - without it the Receive cards never wrap", () => {
    expect(ruleBody(receive, ".column")).toContain("container: cards / inline-size;");
  });

  it("a wrapped card drops the divider and gives the pills a full row", () => {
    const narrow = production.slice(production.indexOf("@container cards (max-width: 1000px)"));
    expect(narrow).toContain("flex-wrap: wrap;");
    expect(narrow).toContain(".card > .separator");
    expect(narrow).toContain("flex: 1 1 100%;");
  });

  it("a card with a thumbnail wraps earlier than one without (it needs 76 px more)", () => {
    const wide = production.slice(production.indexOf("@container cards (max-width: 1080px)"), production.indexOf("@container cards (max-width: 1000px)"));
    expect(wide).toContain(".card_with_thumb");
    expect(wide).not.toContain(".card {");
  });
});
