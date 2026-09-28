import { describe, it, expect } from "vitest";
import { estimatePrintLength } from "./estimatePrintLength.js";
import { estimateConfigFrom } from "./classGlobals.js";

// ETAP 4 (4-types-a): the estimator takes a class's margin and default roll width from the
// profile BY NAME. The printWidths.js constants stand in only for the two names they know
// (Cottons 10 mm / 1420, Polyesters 5 mm / 1550), and a class with no numbers at all is left out
// of the estimate - before, every name but "Cottons" took the Polyesters numbers.

const file = (materialType, extra = {}) => ({
  printTypeCode: "FQ",
  materialType,
  material: "Not In Catalogue",
  width: 600,
  height: 400,
  qty: 1,
  ...extra,
});
const mm = (files, config) => estimatePrintLength(files, config).totalLengthMm;

describe("estimatePrintLength - class numbers by name", () => {
  it("a renamed class uses ITS numbers from the profile, not the Polyesters branch", () => {
    const config = estimateConfigFrom([], { materialClasses: [{ name: "Cotton", margin: 40, defaultRollWidth: 1420 }] });
    expect(mm([file("Cotton")], config)).toBe(440); // 400 + its own 40 mm margin
  });

  it("the profile's number beats the constant of a known class", () => {
    const config = estimateConfigFrom([], { materialClasses: [{ name: "Polyesters", margin: 25, defaultRollWidth: 1550 }] });
    expect(mm([file("Polyesters")], config)).toBe(425);
  });

  it("a known class with no profile numbers takes its constant", () => {
    expect(mm([file("Cottons")], estimateConfigFrom([], null))).toBe(410);
    expect(mm([file("Polyesters")], estimateConfigFrom([], null))).toBe(405);
    expect(mm([file("Cottons")], null)).toBe(410); // no catalogue at all: the degraded path
  });

  it("a class with no numbers anywhere is left out - not measured with the Polyesters ones", () => {
    const config = estimateConfigFrom([], null);
    expect(mm([file("Unknown")], config)).toBe(0);
    expect(mm([file("Silk")], null)).toBe(0);
    expect(mm([file("Cottons"), file("Unknown")], config)).toBe(410); // the known one still counts
  });

  it("the roll width of a renamed class comes from the profile: two 800 mm pieces share a 1600 roll", () => {
    const profile = { materialClasses: [{ name: "Poly", margin: 0, defaultRollWidth: 1600 }] };
    const two = [file("Poly", { width: 800 }), file("Poly", { width: 800 })];
    expect(estimatePrintLength(two, estimateConfigFrom([], profile)).rowsCount).toBe(1);
    const narrow = { materialClasses: [{ name: "Poly", margin: 0, defaultRollWidth: 1500 }] };
    expect(estimatePrintLength(two, estimateConfigFrom([], narrow)).rowsCount).toBe(2);
  });

  it("a fabric in the catalogue keeps its OWN roll width over the class default", () => {
    const profile = { materialClasses: [{ name: "Poly", margin: 0, defaultRollWidth: 1500 }] };
    const two = [file("Poly", { width: 800, material: "Wide" }), file("Poly", { width: 800, material: "Wide" })];
    expect(estimatePrintLength(two, estimateConfigFrom([{ name: "Wide", rollWidth: 1700 }], profile)).rowsCount).toBe(1);
  });
});
