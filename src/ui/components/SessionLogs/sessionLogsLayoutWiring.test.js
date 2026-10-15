import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for Logs: the narrow-window top bar is pinned by reading the stylesheet.

const css = readFileSync(fileURLToPath(new URL("./SessionLogs.module.css", import.meta.url)), "utf8");

const ruleBody = (selector) => {
  const bodies = [...css.matchAll(new RegExp(`(?:^|\n)${selector.replace(".", "\.")} \{([^}]*)\}`, "g"))].map((m) => m[1]);
  expect(bodies.length, `${selector} has a rule of its own`).toBeGreaterThan(0);
  return bodies.join("\n");
};

describe("Logs top bar wraps instead of squeezing the search box", () => {
  it("the bar wraps and has a minimum height, not a fixed one (a wrapped second line must fit)", () => {
    const bar = ruleBody(".topbar");
    expect(bar).toContain("flex-wrap: wrap;");
    expect(bar).toContain("min-height: 76px;");
    expect(bar).not.toMatch(/(^|\s)height: 76px;/);
  });

  it("the search box has a basis it can shrink to and the old 260 px as its ceiling", () => {
    const search = ruleBody(".search_wrapper");
    expect(search).toContain("flex: 1 1 160px;");
    expect(search).toContain("max-width: 260px;");
    expect(search).toContain("min-width: 0;");
  });
});
