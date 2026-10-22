import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The barcode scanner types its code and ends it with Enter. Whatever control holds focus (the buyer's-note bubble after a
// click, Groups, Refresh) would take that Enter as a click - the bubble opens Etsy, the browser takes the focus and the
// following scans never reach RipFlow. The window handler in Production.jsx therefore cancels the Enter that ENDS a scan.
// No component test harness here, so the source is read (comment lines dropped), like rangeSelectWiring.test.js.
const production = readFileSync(fileURLToPath(new URL("./Production.jsx", import.meta.url)), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

// The Enter branch of the scanner's keydown handler, up to the line that clears the buffer.
const start = production.indexOf('if (e.key === "Enter") {');
const enterBranch = production.slice(start, production.indexOf("buffer = \"\";", start));

describe("the Enter that ends a scan", () => {
  it("is found (guards the slice below)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(enterBranch).toContain("handleScanRef.current?.(buffer.trim());");
  });

  it("is cancelled before the scan runs, so it never clicks the focused control", () => {
    expect(enterBranch).toMatch(/if \(buffer\.length > 5\) \{\s*e\.preventDefault\(\);\s*handleScanRef\.current\?\.\(buffer\.trim\(\)\);\s*\}/);
  });

  it("only when the buffer is a scan: an ordinary Enter (short buffer) keeps its default", () => {
    expect(enterBranch.match(/preventDefault/g)).toHaveLength(1);
    expect(enterBranch.indexOf("preventDefault")).toBeGreaterThan(enterBranch.indexOf("if (buffer.length > 5)"));
  });

  it("the scanner still ignores typing into fields and modified keys", () => {
    expect(production).toContain('e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT"');
    expect(production).toContain("e.ctrlKey || e.metaKey || e.altKey");
  });
});
