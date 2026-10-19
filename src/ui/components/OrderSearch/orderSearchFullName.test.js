import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// No UI harness (rejected in 50f64c8): pinned by reading the sources, like orderSearchWiring.test.js.

const DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(DIR, "OrderSearch.module.css"), "utf8");
const jsx = readFileSync(path.join(DIR, "OrderSearch.jsx"), "utf8");

// Rule bodies of a selector, outside and inside the low-window media query.
const bodies = (selector) =>
  [...css.matchAll(new RegExp(`\\n\\s*\\.${selector} \\{([^}]*)\\}`, "g"))].map((m) => m[1]);

describe("OrderSearch shows the file name on ONE line, cut with an ellipsis when it does not fit (FILIP 2026-10-19 12:46)", () => {
  it("cuts a name that does not fit with an ellipsis instead of wrapping it", () => {
    const [name] = bodies("file_name");
    expect(name).toMatch(/overflow: hidden;/);
    expect(name).toMatch(/text-overflow: ellipsis;/);
    expect(name).toMatch(/white-space: nowrap;/);
    expect(name).not.toMatch(/overflow-wrap|flex-shrink: 0|max-width/);
    expect(jsx).toContain("{row.fileName}");
  });

  it("keeps the row height FIXED (a name never makes a row grow), normal and low window alike", () => {
    const rows = bodies("row");
    expect(rows.length).toBe(2);
    for (const body of rows) {
      expect(body).toMatch(/(^|[\s;])height: \d+px;/);
      expect(body).not.toMatch(/min-height/);
    }
  });
});
