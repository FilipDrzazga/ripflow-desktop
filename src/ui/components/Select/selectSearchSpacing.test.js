import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-23 09:41: more room between the search field and the first option of a searchable menu.
const css = readFileSync(fileURLToPath(new URL("./Select.module.css", import.meta.url)), "utf8");

describe("the room under the search field", () => {
  it("is 12px (it was 4px and the first option sat against the field)", () => {
    expect(css).toMatch(/\.search_row\s*\{[^}]*margin:\s*-6px -6px 12px;/s);
  });
});
