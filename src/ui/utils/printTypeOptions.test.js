import { describe, it, expect } from "vitest";
import { printTypeOptions } from "./printTypeOptions.js";

// ETAP 4 (4-types-f): the print-type filter offers the fixed-size types only when the shop
// profile carries them; LM and Cushion (sized from the file) always.

const values = (profile) => printTypeOptions(profile).map((o) => o.value);
const ALEX = { productTypes: [{ code: "SAMPLE" }, { code: "FQ" }, { code: "TEA_TOWEL" }] };

describe("printTypeOptions", () => {
  it("Alex: the old list, in the old order, with the old labels", () => {
    expect(printTypeOptions(ALEX)).toEqual([
      { value: "LM", label: "Linear Meter" },
      { value: "FQ", label: "Fat Quarter" },
      { value: "SAMPLE", label: "Sample" },
      { value: "CUSHION", label: "Cushion" },
      { value: "TEA_TOWEL", label: "Tea Towel" },
    ]);
  });

  it("a shop without tea towels does not get a Tea Towel filter", () => {
    expect(values({ productTypes: [{ code: "FQ" }] })).toEqual(["LM", "FQ", "CUSHION"]);
  });

  it("no profile / no productTypes (the skeleton): only the types sized from the file", () => {
    for (const p of [null, undefined, {}, { productTypes: [] }, { productTypes: "x" }]) expect(values(p)).toEqual(["LM", "CUSHION"]);
  });

  it("a code the parser does not know adds nothing (new types are ETAP 5); broken entries are skipped", () => {
    expect(values({ productTypes: [{ code: "PILLOW" }, null, { code: 3 }, { code: "SAMPLE" }] })).toEqual(["LM", "SAMPLE", "CUSHION"]);
  });
});
