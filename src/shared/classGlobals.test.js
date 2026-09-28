import { describe, it, expect } from "vitest";
import { estimateConfigFrom } from "./classGlobals.js";
import { estimatePrintLength } from "./estimatePrintLength.js";

// ETAP 2g-3b: the class numbers for the estimator come from profile.materialClasses - one
// function for main and renderer. Sentinel matrix explicit (S2 09:33, plan 2g-3b).

const PROFILE = {
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
};
const CATALOGUE = [{ name: "Poplin", type: "Cottons", rollWidth: 1420 }];

describe("estimateConfigFrom - the sentinel matrix", () => {
  it("catalogue not loaded (null) -> null, with or without a profile - never { fabrics: [] } (rule 23)", () => {
    expect(estimateConfigFrom(null, PROFILE)).toBeNull();
    expect(estimateConfigFrom(null, null)).toBeNull();
    expect(estimateConfigFrom(undefined, PROFILE)).toBeNull();
  });

});

describe("the estimate itself: profile numbers = the numbers fabric_globals gave (Alex)", () => {
  const files = [
    { printTypeCode: "LM", materialType: "Cottons", material: "Poplin", width: 700, height: 900, qty: 1 },
    { printTypeCode: "FQ", materialType: "Cottons", material: "Unlisted Cotton", width: 670, height: 480, qty: 3 },
    { printTypeCode: "LM", materialType: "Polyesters", material: "Any Poly", width: 760, height: 500, qty: 1 },
  ];
  // what fabricCache.getEstimateConfig built before 2g-3b from Alex's fabric_globals (= seed)
  const before = { globals: { marginCotton: 10, marginPoly: 5, defaultXmlWidthCotton: 1420, defaultXmlWidthPoly: 1420, defaultRollWidthCotton: 1420, defaultRollWidthPoly: 1550 }, fabrics: CATALOGUE };

  it("identical length with the profile config", () => {
    expect(estimatePrintLength(files, estimateConfigFrom(CATALOGUE, PROFILE))).toEqual(estimatePrintLength(files, before));
  });

  it("identical length with no profile (class constants = the seed)", () => {
    expect(estimatePrintLength(files, estimateConfigFrom(CATALOGUE, null))).toEqual(estimatePrintLength(files, before));
  });

  it("a profile margin change DOES reach the estimate (the profile is the owner now)", () => {
    const p = { materialClasses: [{ name: "Cottons", margin: 40, defaultRollWidth: 1420 }] };
    expect(estimatePrintLength(files, estimateConfigFrom(CATALOGUE, p)).totalLengthMm).toBeGreaterThan(estimatePrintLength(files, before).totalLengthMm);
  });
});
