import { describe, it, expect } from "vitest";
import { previewBuyerNote } from "./etsyView.js";

// The buyer's note of "Check newest order" (plan MSG): what main sent as `buyerNote`, cleaned again by the same rule,
// or null - Settings then shows no block at all.
describe("previewBuyerNote", () => {
  it("the note main sent", () => {
    expect(previewBuyerNote({ receipt: { receiptId: "1" }, buyerNote: "Gift - please no invoice.\nThanks!", lines: [] })).toBe(
      "Gift - please no invoice.\nThanks!",
    );
  });

  it("cleaned again, so the page does not rely on main", () => {
    expect(previewBuyerNote({ buyerNote: "  one\r\ntwo\t " })).toBe("one\ntwo");
  });

  it.each([
    ["no answer yet", null],
    ["no key (an older main)", { receipt: { receiptId: "1" }, lines: [] }],
    ["null", { buyerNote: null }],
    ["blank", { buyerNote: "   " }],
    ["not text", { buyerNote: 5 }],
  ])("nothing for %s", (_label, res) => {
    expect(previewBuyerNote(res)).toBeNull();
  });
});
