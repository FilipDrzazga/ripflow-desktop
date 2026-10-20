import { describe, it, expect } from "vitest";
import { estimatePrintLength } from "./estimatePrintLength.js";
import { stretchedHeight, validLengthExtraPercent } from "./lengthAllowance.js";

// The length allowance of a fabric (fabric_length_extra): a material that shrinks in the heat press
// is printed LONGER by its percent - every file of it, whatever its print type - and the metres
// follow the stretched height. No allowance anywhere = the estimate of before the feature.

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

describe("stretchedHeight", () => {
  it("adds the percent, in whole mm", () => {
    expect(stretchedHeight(1000, 5)).toBe(1050);
    expect(stretchedHeight(995, 5)).toBe(1045); // 1044.75
    expect(stretchedHeight(500, 3.3)).toBe(517); // 516.5 rounds up
    expect(stretchedHeight(333, 3.3)).toBe(344); // 343.989
  });

  it("the result is always a whole number, whatever the height and the percent", () => {
    for (const height of [1, 220, 333, 670, 995, 1234.5, 2999.99])
      for (const percent of [0.1, 1.5, 3.3, 5, 7.77, 12.5, 99.9]) {
        expect(Number.isInteger(stretchedHeight(height, percent))).toBe(true);
      }
    expect(stretchedHeight("2000", 5)).toBe(2100);
  });

  it("returns the height AS GIVEN for no allowance (same value, same type)", () => {
    for (const none of [0, undefined, null, -5, "7", NaN]) {
      expect(stretchedHeight(1000, none)).toBe(1000);
      expect(stretchedHeight("1000", none)).toBe("1000");
    }
  });

  it("validLengthExtraPercent keeps only a finite number above 0", () => {
    expect([0, -1, "5", NaN, null, undefined, 2.5].map(validLengthExtraPercent)).toEqual([0, 0, 0, 0, 0, 0, 2.5]);
  });
});

describe("estimatePrintLength with a length allowance", () => {
  it("measures the files of the fabric at the stretched height (the margin is not stretched)", () => {
    const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: 5 })] };
    const result = estimatePrintLength([file("Satin"), file("Satin")], config);
    // (995 * 1.05 = 1044.75 -> 1045 mm, + 5 margin) per file = 1050, two rows
    expect(result.totalLengthMm).toBe(2100);
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

  it("only the fabric with the allowance grows, also next to one of the same roll width", () => {
    const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: 10 }), fabric("Chiffon")] };
    const result = estimatePrintLength([file("Satin"), file("Chiffon")], config);
    expect(result.totalLengthMm).toBe(1100 + 1000); // 995 * 1.1 = 1094.5 -> 1095, + 5
    expect(result.rowsCount).toBe(2);
  });

  it("files that nest into one row stay one row, the row is as tall as its stretched files", () => {
    const config = { classes, fabrics: [fabric("Satin", { rollWidth: 3000, lengthExtraPercent: 2 })] };
    const half = { width: 1400 };
    const result = estimatePrintLength([file("Satin", half), file("Satin", half)], config);
    expect(result.rowsCount).toBe(1);
    expect(result.totalLengthMm).toBe(1020); // 995 * 1.02 = 1014.9 -> 1015, + 5
  });

  it("stretches a fixed-size product too, not only linear metres", () => {
    const config = { classes, fabrics: [fabric("Satin", { rollWidth: 3000, lengthExtraPercent: 5 })] };
    const cushion = file("Satin", { printTypeCode: "CUSHION", width: 400, height: 400, qty: 2 });
    const result = estimatePrintLength([cushion], config);
    expect(result.rowsCount).toBe(1);
    expect(result.totalLengthMm).toBe(425); // 400 * 1.05 = 420, + 5
  });

  it("ignores a negative or non-numeric allowance", () => {
    const files = [file("Satin")];
    for (const bad of [-5, "7", NaN, null]) {
      const config = { classes, fabrics: [fabric("Satin", { lengthExtraPercent: bad })] };
      expect(estimatePrintLength(files, config).totalLengthMm).toBe(1000);
    }
  });
});
