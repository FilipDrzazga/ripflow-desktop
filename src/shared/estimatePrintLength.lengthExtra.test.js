import { describe, it, expect } from "vitest";
import { estimatePrintLength } from "./estimatePrintLength.js";

// The length allowance of a fabric (fabric_length_extra): a material that shrinks in the heat press
// is measured longer by its percent. No allowance anywhere = the estimate of before the feature.

const classes = { Polyesters: { margin: 5, defaultRollWidth: 1550 } };
const fabric = (name, extra = {}) => ({ name, type: "Polyesters", xmlWidth: 1420, rollWidth: 1420, ...extra });
const file = (material, extra = {}) => ({
  material,
  materialType: "Polyesters",
  printTypeCode: "LM",
  width: 1420,
  height: 995, // + 5 margin = 1000 mm per file, one per row
  qty: 1,
  ...extra,
});

describe("estimatePrintLength with a length allowance", () => {
  it("adds the percent to the length of the fabric's files", () => {
    const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: 5 })] };
    const result = estimatePrintLength([file("Satin"), file("Satin")], config);
    expect(result.totalLengthMm).toBeCloseTo(2100, 6);
    expect(result.fixedTotalLengthM).toBe(2.1);
    expect(result.rowsCount).toBe(2);
  });

  it("is the old answer for 0, for a missing field and for a fabric outside the catalogue", () => {
    const files = [file("Satin"), file("Satin")];
    const plain = estimatePrintLength(files, { classes, fabrics: [fabric("Satin")] });
    expect(plain.fixedTotalLengthM).toBe(2);
    expect(estimatePrintLength(files, { classes, fabrics: [fabric("Satin", { lengthExtraPercent: 0 })] })).toEqual(plain);
    expect(estimatePrintLength(files, { classes, fabrics: [fabric("Other", { lengthExtraPercent: 9 })] })).toEqual(plain);
    expect(estimatePrintLength(files, null).rowsCount).toBe(plain.rowsCount);
  });

  it("measures two fabrics of one roll width apart: only the one with the allowance grows", () => {
    const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: 10 }), fabric("Chiffon")] };
    // same roll width, so without the allowance they would nest together; here each has its own rolls
    const result = estimatePrintLength([file("Satin"), file("Chiffon")], config);
    expect(result.totalLengthMm).toBeCloseTo(1100 + 1000, 6);
    expect(result.rowsCount).toBe(2);
  });

  it("two files of the fabric nest first, then the allowance applies to the whole group", () => {
    const config = { classes, fabrics: [fabric("Satin", { rollWidth: 3000, lengthExtraPercent: 2 })] };
    const half = { width: 1400 };
    const result = estimatePrintLength([file("Satin", half), file("Satin", half)], config);
    // both fit one 3000 mm row: 1000 mm, +2%
    expect(result.rowsCount).toBe(1);
    expect(result.totalLengthMm).toBeCloseTo(1020, 6);
  });

  it("ignores a negative or non-numeric allowance", () => {
    const files = [file("Satin")];
    for (const bad of [-5, "7", NaN, null]) {
      const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: bad })] };
      expect(estimatePrintLength(files, config).totalLengthMm).toBe(1000);
    }
  });
});
