import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// E4c: no UI harness (50f64c8), so how the bar offers the suggestion is pinned by reading the source (comment lines dropped).
const bar = readFileSync(fileURLToPath(new URL("./EtsyImportBar.jsx", import.meta.url)), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("the suggestion in the Etsy bar", () => {
  it("is read through suggestionOf and shown with its own label", () => {
    expect(bar).toContain("const suggestion = suggestionOf(row);");
    expect(bar).toContain("{suggestion && (");
    expect(bar).toContain("suggestionText(suggestion)");
  });

  it("only FILLS the field - Use writes through setValue, it never retries or calls main by itself", () => {
    const use = bar.slice(bar.indexOf("{suggestion && ("), bar.indexOf("{suggestion && (") + 700);
    expect(use).toContain("onClick={() => setValue(row, suggestion)}");
    expect(use).not.toMatch(/handleRetry|retryEtsyImport/);
  });

  it("offers Use only while the field holds something else, and not while the line is busy", () => {
    expect(bar).toMatch(/valueOf\(row\) !== suggestion && \(\s+<button[^>]*disabled=\{busy\}/);
  });
});
