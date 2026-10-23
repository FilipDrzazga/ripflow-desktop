import { describe, it, expect } from "vitest";
import { printTypeOptions } from "./printTypeOptions";
import { PRINT_TYPE_MAP } from "../constants/printTypeMap";

// A snood and an apron (FILIP 2026-10-23): a symbol in the Print view like LM's ruler and Sample's flask, and a place
// in the type filter - the filter only when the shop profile carries the size, like the other fixed-size types.

const profileWith = (...codes) => ({ productTypes: codes.map((code) => ({ code, width: 500, height: 700 })) });

describe("the symbol of a snood and an apron", () => {
  it.each([
    ["SNOOD", "Snood"],
    ["APRON", "Apron"],
  ])("%s has an icon, a colour and the label %s", (code, label) => {
    const def = PRINT_TYPE_MAP[code];
    expect(def.label).toBe(label);
    expect(def.Icon).toBeTruthy();
    expect(def.color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("no two types share an icon (the operator tells them apart by the symbol)", () => {
    const icons = Object.values(PRINT_TYPE_MAP).map((d) => d.Icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("every type the filter can offer has a symbol", () => {
    const all = printTypeOptions(profileWith("FQ", "SAMPLE", "TEA_TOWEL", "SNOOD", "APRON"));
    for (const { value } of all) expect(PRINT_TYPE_MAP[value]).toBeDefined();
  });
});

describe("the type filter", () => {
  it("offers Snood and Apron when the profile carries them, after Tea Towel", () => {
    expect(printTypeOptions(profileWith("FQ", "SAMPLE", "TEA_TOWEL", "SNOOD", "APRON")).map((o) => o.value)).toEqual([
      "LM",
      "FQ",
      "SAMPLE",
      "CUSHION",
      "TEA_TOWEL",
      "SNOOD",
      "APRON",
    ]);
  });

  it("does not offer them to a shop whose profile has no size for them", () => {
    const values = printTypeOptions(profileWith("FQ", "SAMPLE", "TEA_TOWEL")).map((o) => o.value);
    expect(values).not.toContain("SNOOD");
    expect(values).not.toContain("APRON");
  });

  it("offers only the one the profile carries", () => {
    const values = printTypeOptions(profileWith("SNOOD")).map((o) => o.value);
    expect(values).toContain("SNOOD");
    expect(values).not.toContain("APRON");
  });
});
