import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for Custom Orders (see cardContainerWiring.test.js): the narrow-column layout is pinned by reading
// the stylesheets. A container query only matches when an ANCESTOR of the restyled element declares the container by
// the same name - miss it, or put it on the element the query restyles, and the query silently never applies.

const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const page = read("./CustomOrder.module.css");
const card = read("./CustomOrderCard.module.css");
const history = read("./CustomOrderHistory.module.css");

const ruleBody = (css, selector) => {
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]);
  expect(bodies.length, `${selector} has a rule of its own`).toBeGreaterThan(0);
  return bodies.join("\n");
};

const afterQuery = (css, query) => {
  const at = css.indexOf(query);
  expect(at, `${query} is in the stylesheet`).toBeGreaterThan(-1);
  return css.slice(at);
};

describe("imported-CSV card header follows the width of its list", () => {
  it("the list declares the container the card query names, and the card header is not that container", () => {
    expect(card).toMatch(/@container cocards \(max-width: 1000px\)/);
    expect(ruleBody(page, ".cards_list")).toContain("container: cocards / inline-size;");
    expect(ruleBody(card, ".card_header")).not.toContain("container:");
  });

  it("the narrow rule wraps the header, frees its height and breaks the line before PO / printers / buttons", () => {
    const narrow = afterQuery(card, "@container cocards");
    expect(narrow).toContain("flex-wrap: wrap;");
    expect(narrow).toContain("height: auto;");
    expect(narrow).toContain(".card_header::after");
    expect(narrow).toContain("flex: 0 0 100%;");
  });

  it("the wide header is unchanged: the wrap lives only inside the query", () => {
    const wide = card.slice(0, card.indexOf("@container cocards"));
    expect(ruleBody(wide, ".card_header")).not.toContain("flex-wrap");
    expect(ruleBody(wide, ".card_header")).toContain("height: 48px;");
  });
});

describe("history entry header follows the width of the history column", () => {
  it("the column declares the container the history query names", () => {
    expect(history).toMatch(/@container cohistory \(max-width: 640px\)/);
    expect(ruleBody(page, ".right_column")).toContain("container: cohistory / inline-size;");
    expect(ruleBody(history, ".card_header")).not.toContain("container:");
  });

  it("the narrow rule moves PO / count / date to a line of their own", () => {
    const narrow = afterQuery(history, "@container cohistory");
    expect(narrow).toContain("flex-wrap: wrap;");
    expect(narrow).toContain("flex: 0 0 100%;");
    expect(narrow).toContain(".chevron,");
  });

  it("the wide header is unchanged: the wrap lives only inside the query", () => {
    const wide = history.slice(0, history.indexOf("@container cohistory"));
    expect(ruleBody(wide, ".card_header")).not.toContain("flex-wrap");
    expect(ruleBody(wide, ".card_header")).toContain("height: 48px;");
  });
});
