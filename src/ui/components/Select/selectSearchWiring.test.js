import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-23: a search field in the long fabric list, and a menu wide enough for no horizontal scrollbar.
// React has no harness here (50f64c8): the sources are read.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const select = read("./Select.jsx");
const css = read("./Select.module.css");
const bar = read("../EtsyImportBar/EtsyImportBar.jsx");

describe("the search of a Select", () => {
  it("is off unless asked for, and only the Fabrics dropdown of the Etsy bar asks", () => {
    expect(select).toMatch(/searchable = false/);
    expect(bar.match(/\bsearchable\b/g)).toHaveLength(1);
    const at = bar.indexOf("options={fabricSelectOptions(");
    const fabric = bar.slice(bar.lastIndexOf("<Select", at), bar.indexOf("/>", at));
    expect(fabric).toContain("searchable");
  });

  it("the field takes the keyboard when the menu opens, and the text is cleared at every open", () => {
    expect(select).toContain("ref={focusSearch}");
    expect(select).toMatch(/onClick=\{\(\) => \{\s*setQuery\(""\);\s*setOpen\(\(v\) => !v\);\s*\}\}/);
  });

  it("filters through the one helper, Enter takes the first match, an empty result says so", () => {
    expect(select).toContain("const shown = searchable ? filterOptions(options, query) : options;");
    expect(select).toMatch(/e\.key === "Enter" && shown\.length > 0[\s\S]*?pick\(shown\[0\]\)/);
    expect(select).toContain("Nothing matches");
    expect(select).toContain("{shown.map((option) => {");
  });

  it("the placement counts the search row, so a menu near the bottom of the window opens upwards in time", () => {
    expect(select).toContain("(searchable ? SEARCH_ROW_HEIGHT : 0)");
  });

  it("the search row stays on top while the options scroll", () => {
    expect(css).toMatch(/\.search_row\s*\{[^}]*position:\s*sticky;/s);
  });
});

describe("the width of the menu", () => {
  it("never shows a horizontal scrollbar: wide enough for a long fabric name, longer ones wrap", () => {
    expect(css).toMatch(/\.menu\s*\{[^}]*max-width:\s*min\(420px, calc\(100vw - 24px\)\);[^}]*overflow-x:\s*hidden;/s);
    expect(css).toMatch(/\.option\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s);
    expect(css).not.toMatch(/\.option\s*\{[^}]*white-space:\s*nowrap;/s);
  });
});
