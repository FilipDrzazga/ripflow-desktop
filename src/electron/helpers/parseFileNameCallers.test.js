import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

// ETAP 4 (4-types-e, S2's condition for variant A): parsePrintFileName with NO shopConfig still
// answers with Alex's built-in product sizes - kept only for the characterization tests until
// ETAP 5. A production call that forgot the option would therefore size files with another
// shop's dimensions in silence, which rule 24 forbids. This reads the sources and requires every
// call outside the tests to pass `shopConfig:` explicitly.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SCAN = ["src", "scripts"];

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(m?js|jsx|cjs)$/.test(name) && !/\.test\.js$/.test(name) ? [p] : [];
  });

// Every call site with the text of its argument list (up to the matching parenthesis).
const callSites = () => {
  const out = [];
  for (const file of SCAN.flatMap((d) => sourceFiles(join(ROOT, d)))) {
    const src = readFileSync(file, "utf8");
    const re = /\bparsePrintFileName\(/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 20), m.index);
      if (/function\s+$/.test(before)) continue; // the definition itself
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < src.length && depth > 0) {
        if (src[i] === "(") depth += 1;
        else if (src[i] === ")") depth -= 1;
        i += 1;
      }
      const line = src.slice(0, m.index).split("\n").length;
      out.push({ where: `${relative(ROOT, file).replace(/\\/g, "/")}:${line}`, args: src.slice(m.index + m[0].length, i - 1) });
    }
  }
  return out;
};

describe("every production call of parsePrintFileName passes shopConfig", () => {
  it("finds the call sites at all (a scan that finds none proves nothing)", () => {
    // 7 in src/electron at 4-types-e + the golden harness; more is fine, fewer means the scan broke
    expect(callSites().length).toBeGreaterThanOrEqual(8);
  });

  it("none of them omits shopConfig", () => {
    const missing = callSites().filter((c) => !/\bshopConfig\s*:/.test(c.args)).map((c) => c.where);
    expect(missing).toEqual([]);
  });
});
