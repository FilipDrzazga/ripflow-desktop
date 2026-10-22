import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-22 (plan FILIP-1): one Etsy order line = one row. S2 13:50 found the text running under the actions
// at 1280-1366 (the suggestion's Use under "Open order in Etsy"); the layout was measured offscreen at 960..1920
// (agents/chat/artefakty/etsy-ui-row/s1/result-final.txt). No UI harness here (50f64c8), so the CSS that makes
// it hold is pinned by reading the source (comment lines dropped).
const css = readFileSync(fileURLToPath(new URL("./EtsyImportBar.module.css", import.meta.url)), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("/*") && !line.trim().startsWith("*"))
  .join("\n");

const rule = (selector) => {
  const match = css.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : "";
};

describe("an Etsy line never runs under its own buttons", () => {
  it("the row wraps: with too little room the actions take a line of their own, kept on the right", () => {
    expect(rule(".line")).toMatch(/flex-wrap:\s*wrap;/);
    expect(rule(".actions")).toMatch(/flex:\s*0 0 auto;/);
    expect(rule(".actions")).toMatch(/margin-left:\s*auto;/);
  });

  it("the text keeps one line and asks for 620px - enough for title, chip, order and suggestion at their narrowest", () => {
    expect(rule(".line_text")).toMatch(/flex:\s*1 1 620px;/);
    expect(rule(".line_text")).toMatch(/white-space:\s*nowrap;/);
    expect(rule(".line_text")).not.toMatch(/flex-wrap:\s*wrap/);
  });

  it("the reason is the part that gives way, cut with an ellipsis", () => {
    expect(rule(".line_reason")).toMatch(/min-width:\s*0;/);
    expect(rule(".line_reason")).toMatch(/overflow:\s*hidden;/);
    expect(rule(".line_reason")).toMatch(/text-overflow:\s*ellipsis;/);
  });
});
