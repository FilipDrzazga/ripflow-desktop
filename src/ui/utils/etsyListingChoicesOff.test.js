import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { choicesSwitchedOff, ETSY_DISABLED_CODE } from "./etsyListingChoices";

// D84: Settings > Etsy > Remembered choices with features.etsy Off shows nothing, not a red error.
describe("choicesSwitchedOff", () => {
  it("is true for the answer main gives while the Etsy flag is Off", () => {
    expect(ETSY_DISABLED_CODE).toBe("ETSY_DISABLED");
    expect(choicesSwitchedOff({ success: false, error: { code: "ETSY_DISABLED" } })).toBe(true);
  });

  it.each([
    ["a good answer", { success: true, data: [] }],
    ["an unreadable table", { success: false, error: { code: "DB_READ_FAILED" } }],
    ["an error with no code", { success: false, error: {} }],
    ["no answer at all", undefined],
  ])("is false for %s - that one is still shown", (_label, res) => {
    expect(choicesSwitchedOff(res)).toBe(false);
  });
});

describe("the view", () => {
  const view = readFileSync(fileURLToPath(new URL("../components/Settings/views/EtsyListingChoices.jsx", import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("renders nothing while the flag is Off, and keeps its error line for every other failure", () => {
    expect(view).toContain("setSwitchedOff(choicesSwitchedOff(res));");
    expect(view).toContain("if (switchedOff) return null;");
    expect(view).toContain("setLoadError(choicesLoadError(res).message);");
  });
});
