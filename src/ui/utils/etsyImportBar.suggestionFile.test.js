import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { suggestionFileNote, suggestionFileFits, suggestionText } from "./etsyImportBar";
import { previewLineView } from "./etsyView";
import { ETSY_IMPORT_STATE } from "../../shared/constants";

// D76: the library file a suggestion names, shown where a person decides whether to use the number - the tooltip of the
// "XWD<number>" button and the dry run's "Suggestion" row.
const FILE = "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg";
const row = (over = {}) => ({
  receiptId: "3456789012",
  transactionId: "501",
  state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
  suggestedXwd: "110328",
  suggestedFile: FILE,
  ...over,
});

describe("suggestionFileNote", () => {
  it("names the library file after the suggestion's sentence", () => {
    expect(suggestionFileNote(row())).toBe(` Library file: "${FILE}".`);
    expect(suggestionText("110328") + suggestionFileNote(row())).toMatch(/Check the file before you use it\. Library file: "BANANA PRINT XWD110328_/);
  });

  it("is empty where the suggestion is not offered, or the row has no usable name (a row from before D76, a failed ALTER)", () => {
    for (const r of [
      row({ state: ETSY_IMPORT_STATE.RETRY }), // no suggestion offered while a Retry waits
      row({ suggestedXwd: null }),
      row({ suggestedXwd: "12345" }),
      row({ suggestedFile: null }),
      row({ suggestedFile: undefined }),
      row({ suggestedFile: "   " }),
      row({ suggestedFile: 42 }),
      null,
      undefined,
    ]) {
      expect(suggestionFileNote(r)).toBe("");
    }
  });
});

describe("a file name of ANOTHER number is never shown beside the number (D83)", () => {
  it("the tooltip tail is empty when the name does not carry the suggested number", () => {
    expect(suggestionFileNote(row({ suggestedXwd: "204411" }))).toBe("");
    expect(suggestionFileNote(row({ suggestedXwd: "204411", suggestedFile: "FOX xwd204411_a_b.jpg" }))).toBe(' Library file: "FOX xwd204411_a_b.jpg".');
  });

  it("suggestionFileFits wants the number as XWD<digits> in the name, any case", () => {
    expect(suggestionFileFits("110328", FILE)).toBe(true);
    expect(suggestionFileFits("110328", FILE.toLowerCase())).toBe(true);
    for (const [xwd, name] of [["110329", FILE], ["110328", "BANANA 110328.jpg"], [null, FILE], ["110328", null], [110328, FILE]]) {
      expect(suggestionFileFits(xwd, name)).toBe(false);
    }
  });

  it("the dry run falls back to the plain sentence for a name of another number", () => {
    const line = { ok: false, title: null, quantity: null, reason: "No XWD pattern number.", suggestedXwd: "204411", suggestedFile: FILE, recordedState: null };
    expect(previewLineView(line).rows.at(-1)).toEqual({ label: "Suggestion", value: "XWD204411 - the library file that matches the listing title" });
  });
});

describe("the dry run's Suggestion row", () => {
  it("shows the file name when main sent one, the old sentence when it did not", () => {
    const line = { ok: false, title: null, quantity: null, reason: "No XWD pattern number.", suggestedXwd: "110328", recordedState: null };
    expect(previewLineView({ ...line, suggestedFile: FILE }).rows.at(-1)).toEqual({ label: "Suggestion", value: `XWD110328 - ${FILE}` });
    expect(previewLineView(line).rows.at(-1)).toEqual({ label: "Suggestion", value: "XWD110328 - the library file that matches the listing title" });
  });
});

describe("the bar", () => {
  it("puts the file note on the same tooltip as the sentence, for the same row", () => {
    const bar = readFileSync(fileURLToPath(new URL("../components/EtsyImportBar/EtsyImportBar.jsx", import.meta.url)), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(bar).toContain("title={suggestionText(suggestion) + suggestionFileNote(row)}");
  });
});
