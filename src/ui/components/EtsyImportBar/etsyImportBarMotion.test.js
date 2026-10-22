import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-22 (list 12:57, point 4): the bar slides open and shut. No UI harness (50f64c8), so the
// wiring is pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const css = read("./EtsyImportBar.module.css");

describe("the Etsy bar slides open and shut", () => {
  it("keeps the list mounted and makes it inert while closed (a hidden XWD field must not take Enter -> Retry)", () => {
    expect(bar).toMatch(/className=\{`\$\{styles\.list_wrap\} \$\{open \? styles\.list_wrap_open : ""\}`\} inert=\{!open\}/);
    expect(bar).not.toMatch(/\{open && \(/);
  });

  it("animates the height through a grid row 0fr -> 1fr, clipped while closed", () => {
    expect(css).toMatch(/\.list_wrap\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*0fr;[^}]*transition:\s*grid-template-rows/s);
    expect(css).toMatch(/\.list_wrap_open\s*\{[^}]*grid-template-rows:\s*1fr;/s);
    expect(css).toMatch(/\.list_clip\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  });

  it("turns the motion off for a person who asked the system for less of it", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.chevron,\s*\.list_wrap\s*\{\s*transition:\s*none;/);
  });
});
