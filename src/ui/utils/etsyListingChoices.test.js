import { describe, it, expect } from "vitest";
import { FORGET_KIND, choiceRows, choiceTitle, choicesLoadError, forgetConfirmMessage, forgetNotice, printTypeLabel } from "./etsyListingChoices";

const ROW = { listingId: "1351273307", title: "Cat and Floral Pattern III - Adult Snood", fabric: "Active Eco Lycra", printType: "SNOOD" };

describe("choiceTitle", () => {
  it("is the title Etsy gave a line of the listing", () => {
    expect(choiceTitle(ROW)).toBe("Cat and Floral Pattern III - Adult Snood");
  });
  it.each([[{ listingId: "42", title: null }], [{ listingId: "42", title: "   " }], [{ listingId: "42" }]])("falls back to the number (%j)", (row) => {
    expect(choiceTitle(row)).toBe("Listing 42");
  });
});

describe("printTypeLabel", () => {
  it("names the codes a person can choose", () => {
    expect(printTypeLabel("SNOOD")).toBe("Snood");
    expect(printTypeLabel("APRON")).toBe("Apron");
  });
  it("shows a code nobody can choose as it is stored, and never a prototype key's value", () => {
    expect(printTypeLabel("CUSHION")).toBe("CUSHION");
    expect(printTypeLabel("constructor")).toBe("constructor");
  });
});

describe("forgetConfirmMessage", () => {
  it("names the choice and the listing, and what happens next", () => {
    const fabric = forgetConfirmMessage(ROW, FORGET_KIND.FABRIC);
    expect(fabric).toContain('fabric "Active Eco Lycra"');
    expect(fabric).toContain("Cat and Floral Pattern III - Adult Snood");
    expect(fabric).toContain("stop in the Inbox bar again");
    expect(forgetConfirmMessage(ROW, FORGET_KIND.PRINT_TYPE)).toContain('product type "Snood"');
  });
});

describe("forgetNotice", () => {
  it("a forgotten choice is a Success", () => {
    expect(forgetNotice({ success: true, deleted: true }, ROW, FORGET_KIND.FABRIC)).toMatchObject({ type: "Success" });
  });
  it("nothing left to forget is a Warning (another station was first), not an error", () => {
    expect(forgetNotice({ success: true, deleted: false }, ROW, FORGET_KIND.PRINT_TYPE)).toMatchObject({ type: "Warning" });
  });
  it("a failed call carries main's own title and message", () => {
    expect(forgetNotice({ success: false, error: { type: "Warning", title: "Etsy import", message: "off" } }, ROW, FORGET_KIND.FABRIC)).toEqual({
      type: "Warning",
      title: "Etsy import",
      message: "off",
    });
  });
  it("no answer at all is an Error", () => {
    expect(forgetNotice(undefined, ROW, FORGET_KIND.FABRIC)).toMatchObject({ type: "Error" });
  });
});

describe("choiceRows", () => {
  it("is the rows of a good answer", () => {
    expect(choiceRows({ success: true, data: [ROW] })).toEqual([ROW]);
  });
  it("an empty list is an empty list - it was read", () => {
    expect(choiceRows({ success: true, data: [] })).toEqual([]);
  });
  it.each([[undefined], [{ success: false }], [{ success: true }], [{ success: true, data: {} }]])("an answer that is not a list (%j) is null - could not be read", (res) => {
    expect(choiceRows(res)).toBeNull();
  });
  it("drops a row with no listing or with neither choice", () => {
    expect(choiceRows({ success: true, data: [ROW, { listingId: "1", fabric: null, printType: null }, { fabric: "Drill" }, null] })).toEqual([ROW]);
  });
});

describe("choicesLoadError", () => {
  it("says what main said", () => {
    expect(choicesLoadError({ success: false, error: { message: "The remembered Etsy choices could not be read." } }).message).toBe("The remembered Etsy choices could not be read.");
  });
});
