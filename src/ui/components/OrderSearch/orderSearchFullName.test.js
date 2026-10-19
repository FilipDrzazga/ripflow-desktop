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

describe("OrderSearch shows the FULL file name on a found row (FILIP 2026-10-19 10:54)", () => {
  it("never cuts the name with an ellipsis: it wraps instead", () => {
    const [name] = bodies("file_name");
    expect(name).toMatch(/overflow-wrap: anywhere;/);
    expect(name).not.toMatch(/text-overflow|white-space: nowrap|overflow: hidden/);
    expect(jsx).toContain("{row.fileName}");
  });

  it("lets the row grow with a wrapped name: the height is a floor (min-height), normal and low window alike", () => {
    const rows = bodies("row");
    expect(rows.length).toBe(2);
    for (const body of rows) {
      expect(body).toMatch(/min-height: \d+px;/);
      expect(body).not.toMatch(/(^|[\s;])height: \d+px;/);
    }
  });
});
