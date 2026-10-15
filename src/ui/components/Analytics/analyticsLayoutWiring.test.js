import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for Analytics (see cardContainerWiring.test.js): the narrow-table layout is pinned by reading the
// stylesheets and the card markup. The two-row card is chosen by the width of the table's scroll area, so that area
// must be a container with the name the query asks for - miss it and the query silently never matches.

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const details = read("Details/Details.module.css");
const summary = read("Summary/Summary.module.css");
const jsx = read("Details/Details.jsx");

const ruleBody = (css, selector) => {
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]);
  expect(bodies.length, `${selector} has a rule of its own`).toBeGreaterThan(0);
  return bodies.join("\n");
};

describe("Analytics table wraps by the width of its scroll area", () => {
  it("the query names the container .content declares", () => {
    expect(details).toMatch(/@container atable \(max-width: 780px\)/);
    expect(ruleBody(details, ".content")).toContain("container: atable / inline-size;");
  });

  it("the narrow card is two rows and the column header goes away", () => {
    const narrow = details.slice(details.indexOf("@container atable"));
    expect(narrow).toContain("grid-template-rows: auto auto;");
    expect(narrow).toContain(".col_header {\n    display: none;");
    expect(narrow).toContain(".day_header {\n    top: 0;");
  });

  it("every cell of the card is placed in the narrow grid, and the three badge cells carry their own class", () => {
    const narrow = details.slice(details.indexOf("@container atable"));
    for (const cell of ["order", "customer", "fabric", "meters", "action", "date", "reason", "process", "printer", "type"]) {
      expect(narrow, `.col_${cell} is placed`).toContain(`.col_${cell} { grid-area:`);
    }
    for (const cell of ["process", "printer", "type"]) expect(jsx).toContain(`style.col_${cell}`);
  });
});

describe("short windows scroll instead of cutting", () => {
  it("the Summary column scrolls (Top Fabric / Top reasons were unreachable)", () => {
    expect(ruleBody(summary, ".grid")).toContain("overflow-y: auto;");
  });

  it("the reasons dropdown has a height cap and scrolls", () => {
    const body = ruleBody(details, ".reason_dropdown");
    expect(body).toContain("max-height: calc(100vh - 260px);");
    expect(body).toContain("overflow-y: auto;");
  });
});
