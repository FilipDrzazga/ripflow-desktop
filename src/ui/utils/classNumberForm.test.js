import { describe, it, expect } from "vitest";
import {
  classNumberForm,
  classNumberFields,
  classNumberFormInvalid,
  classNumberFormUnchanged,
} from "./classNumberForm.js";

// ETAP 4 (4-types-b part 2): the Global Parameters form, by class name.

const ALEX = {
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1600 },
  ],
};

describe("classNumberForm", () => {
  it("the profile's numbers per class", () => {
    expect(classNumberForm(ALEX)).toEqual({
      Cottons: { margin: 10, defaultRollWidth: 1420 },
      Polyesters: { margin: 5, defaultRollWidth: 1600 },
    });
  });

  it("a number the profile lacks: the constant for Cottons / Polyesters, an empty field for any other class", () => {
    const p = { materialClasses: [{ name: "Cottons" }, { name: "Poly", margin: 4 }] };
    expect(classNumberForm(p)).toEqual({
      Cottons: { margin: 10, defaultRollWidth: 1420 },
      Poly: { margin: 4, defaultRollWidth: "" },
    });
  });

  it("no profile -> no fields", () => {
    expect(classNumberForm(null)).toEqual({});
    expect(classNumberFields(null)).toEqual([]);
  });
});

describe("classNumberFields", () => {
  it("Alex: the old grid - margins in the first row, roll widths in the second, one column per class", () => {
    expect(classNumberFields(ALEX).map((f) => f.label)).toEqual([
      "Margin Cottons",
      "Margin Polyesters",
      "Roll Width Cottons",
      "Roll Width Polyesters",
    ]);
  });

  it("renamed classes get their own labels", () => {
    const p = { materialClasses: [{ name: "Cotton" }, { name: "Poly" }] };
    expect(classNumberFields(p).map((f) => [f.name, f.field])).toEqual([
      ["Cotton", "margin"],
      ["Poly", "margin"],
      ["Cotton", "defaultRollWidth"],
      ["Poly", "defaultRollWidth"],
    ]);
  });
});

describe("invalid / unchanged", () => {
  it("any empty, zero or negative number makes the form invalid", () => {
    expect(classNumberFormInvalid(classNumberForm(ALEX))).toBe(false);
    for (const bad of ["", "0", "-3", "abc"]) {
      expect(classNumberFormInvalid({ Cottons: { margin: bad, defaultRollWidth: 1420 } })).toBe(true);
    }
  });

  it("unchanged compares numbers, not strings", () => {
    const initial = classNumberForm(ALEX);
    expect(classNumberFormUnchanged({ ...initial, Cottons: { margin: "10", defaultRollWidth: "1420" } }, initial)).toBe(true);
    expect(classNumberFormUnchanged({ ...initial, Cottons: { margin: "11", defaultRollWidth: "1420" } }, initial)).toBe(false);
  });
});
