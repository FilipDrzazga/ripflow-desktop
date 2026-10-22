import { describe, it, expect } from "vitest";
import { suggestionOf, suggestionText } from "./etsyImportBar";
import { ETSY_IMPORT_STATE } from "../../shared/constants";

const row = (over = {}) => ({
  receiptId: "3456789012",
  transactionId: "501",
  state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
  reason: "No XWD pattern number in the SKU, the variations or the title of the order line.",
  suggestedXwd: "173706",
  ...over,
});

describe("suggestionOf (E4c)", () => {
  it("a needs_review or failed line offers the six-digit number the importer stored", () => {
    expect(suggestionOf(row())).toBe("173706");
    expect(suggestionOf(row({ state: ETSY_IMPORT_STATE.FAILED }))).toBe("173706");
  });

  it("a line that already waits for the importer offers nothing - there is nothing left to type", () => {
    expect(suggestionOf(row({ state: ETSY_IMPORT_STATE.RETRY }))).toBeNull();
  });

  it("no number, an old row, or anything that is not six digits is no suggestion", () => {
    for (const bad of [null, undefined, "", "12345", "1737061", "17370x", 173706]) expect(suggestionOf(row({ suggestedXwd: bad }))).toBeNull();
    expect(suggestionOf({ ...row(), suggestedXwd: undefined })).toBeNull();
    expect(suggestionOf(null)).toBeNull();
  });
});

describe("suggestionText", () => {
  it("says it is a suggestion, names the number and tells the person to check the file", () => {
    const text = suggestionText("173706");
    expect(text).toMatch(/^Suggestion: XWD173706/);
    expect(text).toMatch(/Check the file/);
  });
});
