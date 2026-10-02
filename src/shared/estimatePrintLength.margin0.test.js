import { describe, it, expect } from "vitest";
import { estimatePrintLength } from "./estimatePrintLength.js";

// D1 (dlug-1): a class margin of 0 is a legal setting - the Global Parameters editor and the profile
// validator both accept it - so the estimator must USE it, not fall back to the class constant
// (a falsy-zero slip such as `margin || constant` would silently measure with 10 mm).

const file = { printTypeCode: "LM", materialType: "Cottons", material: "Plain", width: 500, height: 1000, qty: 1, variant: null };
const config = (margin) => ({ classes: { Cottons: { margin, defaultRollWidth: 1420 } }, fabrics: [] });
const length = (margin) => estimatePrintLength([file], config(margin)).fixedTotalLengthM;

describe("estimatePrintLength - class margin 0", () => {
  it("measures with the margin of 0, which is shorter than the same job with a margin", () => {
    expect(length(0)).toBeLessThan(length(100));
  });

  it("a margin of 0 is not the class constant", () => {
    expect(length(0)).not.toBe(estimatePrintLength([file], { classes: {}, fabrics: [] }).fixedTotalLengthM);
  });
});
