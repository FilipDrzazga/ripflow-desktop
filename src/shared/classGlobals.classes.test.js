import { describe, it, expect } from "vitest";
import { classNumbersFromProfile, estimateConfigFrom } from "./classGlobals.js";

// ETAP 4 (4-types-a): the estimator config carries the class numbers BY CLASS NAME. It replaced
// the four fixed keys (marginCotton, ...), whose shape three removed tests pinned.

const PROFILE = {
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
};
const CATALOGUE = [{ name: "Poplin", type: "Cottons", rollWidth: 1420 }];

describe("classNumbersFromProfile", () => {
  it("every class by its own name", () => {
    expect(classNumbersFromProfile(PROFILE)).toEqual({
      Cottons: { margin: 10, defaultRollWidth: 1420 },
      Polyesters: { margin: 5, defaultRollWidth: 1550 },
    });
  });

  it("a renamed class keeps its numbers under its own name (a client's 'Cotton' / 'Poly')", () => {
    const p = { materialClasses: [{ name: "Cotton", margin: 12, defaultRollWidth: 1600 }, { name: "Poly", margin: 3, defaultRollWidth: 1800 }] };
    expect(classNumbersFromProfile(p)).toEqual({ Cotton: { margin: 12, defaultRollWidth: 1600 }, Poly: { margin: 3, defaultRollWidth: 1800 } });
  });

  it("a field without a finite number is absent; a broken entry or an empty name adds nothing", () => {
    const p = { materialClasses: [{ name: "Cottons", margin: "10", defaultRollWidth: NaN }, null, { name: "", margin: 1 }, { margin: 2 }, { name: "Polyesters", margin: 5 }] };
    expect(classNumbersFromProfile(p)).toEqual({ Cottons: {}, Polyesters: { margin: 5 } });
  });

  it("the first entry of a name wins", () => {
    const p = { materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }, { name: "Cottons", margin: 99, defaultRollWidth: 9 }] };
    expect(classNumbersFromProfile(p).Cottons).toEqual({ margin: 10, defaultRollWidth: 1420 });
  });

  it("no profile / no materialClasses -> {}", () => {
    for (const p of [null, undefined, { printers: [] }, { materialClasses: "x" }]) expect(classNumbersFromProfile(p)).toEqual({});
  });
});

describe("estimateConfigFrom - the sentinel matrix, classes by name", () => {
  it("profile + catalogue -> { classes, fabrics }", () => {
    expect(estimateConfigFrom(CATALOGUE, PROFILE)).toEqual({ classes: classNumbersFromProfile(PROFILE), fabrics: CATALOGUE });
  });

  it("profile null + catalogue -> { classes: {}, fabrics } (class constants, catalogue still used)", () => {
    expect(estimateConfigFrom(CATALOGUE, null)).toEqual({ classes: {}, fabrics: CATALOGUE });
  });

  it("an EMPTY catalogue is loaded -> { classes, fabrics: [] }", () => {
    expect(estimateConfigFrom([], PROFILE)).toEqual({ classes: classNumbersFromProfile(PROFILE), fabrics: [] });
  });

  it("no `globals` key any more", () => {
    expect(estimateConfigFrom(CATALOGUE, PROFILE)).not.toHaveProperty("globals");
  });
});
