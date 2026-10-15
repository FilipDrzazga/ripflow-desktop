import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { join } from "path";
import { BREAKPOINT_WIDTHS, BREAKPOINT_HEIGHTS } from "./breakpoints.js";

// Every size condition in an @media / @container rule must come from constants/breakpoints.js. A CSS
// variable cannot stand in a media condition, so this test is the single guard against a dozen private
// thresholds (e.g. 1180, 1230) appearing view by view.

const UI_ROOT = fileURLToPath(new URL("..", import.meta.url));

const cssFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Every { rule, dimension, px } found in the conditions of @media / @container at-rules.
const collectConditions = (css) => {
  const found = [];
  const source = stripComments(css);
  const re = /@(media|container)\b([^{]*)\{/g;
  let m;
  while ((m = re.exec(source))) {
    const condition = m[2];
    const size = /(?:(min|max)-)?(width|height)\s*:\s*([\d.]+)\s*([a-z%]*)|(width|height)\s*(<=|>=|<|>)\s*([\d.]+)\s*([a-z%]*)/g;
    let s;
    while ((s = size.exec(condition))) {
      const dimension = s[2] || s[5];
      const value = s[3] ?? s[7];
      const unit = s[4] ?? s[8];
      found.push({ at: m[1], condition: condition.trim(), dimension, value: Number(value), unit });
    }
  }
  return found;
};

describe("collectConditions", () => {
  it("reads classic and range syntax, ignores reduced-motion and comments", () => {
    const css = `
      /* @media (max-width: 777px) { } */
      @media (max-width: 1200px) { .a { color: red; } }
      @media (min-height: 640px) and (max-width: 1100px) { .b {} }
      @media (width <= 900px) { .c {} }
      @media (prefers-reduced-motion: reduce) { .d {} }
      @container (max-width: 40rem) { .e {} }
    `;
    const rows = collectConditions(css).map((r) => [r.at, r.dimension, r.value, r.unit]);
    expect(rows).toEqual([
      ["media", "width", 1200, "px"],
      ["media", "height", 640, "px"],
      ["media", "width", 1100, "px"],
      ["media", "width", 900, "px"],
      ["container", "width", 40, "rem"],
    ]);
  });
});

describe("breakpoints on the allowed list", () => {
  const files = cssFiles(UI_ROOT);

  it("finds the stylesheets (guard: the walk itself works)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every width/height condition in every stylesheet is a px value from constants/breakpoints.js", () => {
    const widths = new Set(BREAKPOINT_WIDTHS);
    const heights = new Set(BREAKPOINT_HEIGHTS);
    const offenders = [];
    for (const file of files) {
      for (const c of collectConditions(readFileSync(file, "utf8"))) {
        const allowed = c.dimension === "width" ? widths : heights;
        if (c.unit !== "px" || !allowed.has(c.value)) {
          offenders.push(`${file.slice(UI_ROOT.length)}: @${c.at} ${c.condition}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the table in styles/global.css lists exactly the values of the constants", () => {
    const global = readFileSync(join(UI_ROOT, "styles", "global.css"), "utf8");
    const table = global.match(/BREAKPOINTS-TABLE:([^\n]*)\n([^\n]*)/);
    expect(table, "global.css carries a BREAKPOINTS-TABLE comment").not.toBeNull();
    const nums = (s) => [...s.matchAll(/\d+/g)].map((x) => Number(x[0]));
    expect(nums(table[1])).toEqual([...BREAKPOINT_WIDTHS]);
    expect(nums(table[2])).toEqual([...BREAKPOINT_HEIGHTS]);
  });
});
