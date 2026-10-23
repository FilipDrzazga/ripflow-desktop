import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-23: "I cannot scroll the list of fabrics". The menu is capped in height and scrolls inside, but the
// Select closes itself on ANY scroll (a capturing window listener: it sees the scroll events of every element, the
// menu's own included), so the first wheel step closed the list. React has no harness here (50f64c8): sources are read.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const select = read("./Select.jsx");
const css = read("./Select.module.css");

describe("the scrolling of a long Select menu", () => {
  it("a scroll that comes from inside the menu does not close it", () => {
    expect(select).toMatch(/const handleScroll = \(e\) => \{\s*if \(menuRef\.current && e\.target instanceof Node && menuRef\.current\.contains\(e\.target\)\) return;\s*close\(\);\s*\};/);
  });

  it("a scroll of the page (or any other element) still closes it - the menu is positioned once", () => {
    expect(select).toContain('window.addEventListener("scroll", handleScroll, true);');
    expect(select).toContain('window.removeEventListener("scroll", handleScroll, true);');
    expect(select).not.toMatch(/addEventListener\("scroll", close/);
    expect(select).toContain('window.addEventListener("resize", close);');
  });

  it("the end of the list does not hand the wheel to the page behind (which would close the menu)", () => {
    expect(css).toMatch(/\.menu\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
  });
});
