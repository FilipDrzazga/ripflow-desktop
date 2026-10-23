import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-23: room around the search field of a searchable menu. 09:41: more room between the field and the first
// option (4px -> 12px); 09:43: halve that (6px) and give the field the saved 6px between itself and the line that
// separates it from the list (6px -> 12px); 09:44: "from the top too" - the same 6px above the field (8px -> 14px).
const css = readFileSync(fileURLToPath(new URL("./Select.module.css", import.meta.url)), "utf8");
const row = css.match(/\.search_row\s*\{([^}]*)\}/s)?.[1] ?? "";

describe("the room around the search field", () => {
  it("is 6px below the separating line, to the first option", () => {
    expect(row).toMatch(/margin:\s*-6px -6px 6px;/);
  });

  it("is 14px above the field and 12px between the field and the separating line", () => {
    expect(row).toMatch(/padding:\s*14px 6px 12px;/);
    expect(row).toMatch(/border-bottom:\s*1px solid var\(--border-grey\);/);
  });

  it("the row still sticks to the top of the menu while the options scroll", () => {
    expect(row).toMatch(/position:\s*sticky;/);
    expect(row).toMatch(/top:\s*-6px;/);
  });
});
