import { describe, it, expect } from "vitest";
import { classGlobalsFromProfile, estimateConfigFrom } from "./classGlobals.js";
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

describe("classGlobalsFromProfile", () => {
  it("maps the two classes onto the four keys the estimator reads", () => {
    expect(classGlobalsFromProfile(PROFILE)).toEqual({
      marginCotton: 10, defaultRollWidthCotton: 1420, marginPoly: 5, defaultRollWidthPoly: 1550,
    });
  });

  it("reads the profile's numbers, whatever they are", () => {
    const p = { materialClasses: [{ name: "Cottons", margin: 13, defaultRollWidth: 1460 }] };
    expect(classGlobalsFromProfile(p)).toEqual({ marginCotton: 13, defaultRollWidthCotton: 1460 });
  });

  it("no profile / no materialClasses -> {} (every number from the class constants)", () => {
    expect(classGlobalsFromProfile(null)).toEqual({});
    expect(classGlobalsFromProfile(undefined)).toEqual({});
    expect(classGlobalsFromProfile({ printers: [] })).toEqual({});
    expect(classGlobalsFromProfile({ materialClasses: "x" })).toEqual({});
  });

  it("a non-number, a third class and a broken entry add nothing", () => {
    const p = { materialClasses: [
      { name: "Cottons", margin: "10", defaultRollWidth: NaN },
      { name: "Linens", margin: 8, defaultRollWidth: 1500 },
      null,
      { name: "Polyesters", margin: 5 },
    ] };
    expect(classGlobalsFromProfile(p)).toEqual({ marginPoly: 5 });
  });

  it("a v2 row (with the dead defaultXmlWidth) gives the same numbers - pilot stations mid-migration", () => {
    const v2 = { materialClasses: [{ name: "Cottons", margin: 10, defaultXmlWidth: 1420, defaultRollWidth: 1420 }] };
    expect(classGlobalsFromProfile(v2)).toEqual({ marginCotton: 10, defaultRollWidthCotton: 1420 });
  });
});

describe("estimateConfigFrom - the sentinel matrix", () => {
  it("profile + catalogue -> { globals from the profile, fabrics }", () => {
    expect(estimateConfigFrom(CATALOGUE, PROFILE)).toEqual({ globals: classGlobalsFromProfile(PROFILE), fabrics: CATALOGUE });
  });

  it("profile null + catalogue -> { globals: {}, fabrics } (class constants, catalogue still used)", () => {
    expect(estimateConfigFrom(CATALOGUE, null)).toEqual({ globals: {}, fabrics: CATALOGUE });
  });

  it("catalogue not loaded (null) -> null, with or without a profile - never { fabrics: [] } (rule 23)", () => {
    expect(estimateConfigFrom(null, PROFILE)).toBeNull();
    expect(estimateConfigFrom(null, null)).toBeNull();
    expect(estimateConfigFrom(undefined, PROFILE)).toBeNull();
  });

  it("an EMPTY catalogue is loaded - { globals, fabrics: [] }", () => {
    expect(estimateConfigFrom([], PROFILE)).toEqual({ globals: classGlobalsFromProfile(PROFILE), fabrics: [] });
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
