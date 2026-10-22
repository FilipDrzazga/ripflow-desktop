import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The group of the two Etsy links ("Open order in Etsy", "Open listing"). Their place and shape - icons at the right
// end of the actions (FILIP 2026-10-22 16:33) - are pinned in etsyImportBarSlim.test.js. No React harness here
// (50f64c8): pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const css = read("./EtsyImportBar.module.css");

describe("the Etsy links of a bar line", () => {
  it("the group does not shrink, so the icons never squeeze", () => {
    expect(css).toMatch(/\.line_links\s*\{[^}]*flex-shrink:\s*0;/s);
  });
});
