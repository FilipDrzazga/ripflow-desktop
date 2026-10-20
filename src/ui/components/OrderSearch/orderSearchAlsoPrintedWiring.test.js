import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// No UI harness (rejected in 50f64c8): the note of a file that waits in the Inbox and was printed before
// (D71) is pinned by reading the source, like orderSearchHistoryWiring.test.js.

const DIR = path.dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(path.join(DIR, "OrderSearch.jsx"), "utf8");

describe("the Inbox row's 'also printed' note", () => {
  it("is drawn in the row's notes, next to 'also in Production', from the row's alsoPrinted", () => {
    const meta = jsx.slice(jsx.indexOf("className={style.row_meta}"), jsx.indexOf("className={style.since}"));
    expect(meta).toContain("row.alsoInProduction");
    expect(meta).toMatch(/row\.alsoPrinted && \(/);
    expect(meta).toContain("sinceLabel(row.alsoPrinted.since, now)");
  });
});
