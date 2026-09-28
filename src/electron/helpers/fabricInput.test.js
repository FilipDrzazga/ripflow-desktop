import { describe, it, expect } from "vitest";
import { fabricSaveError } from "./fabricInput.js";

// ETAP 4 (4-types-b round 2, S2 18:47): fabrics:save refuses a fabric with no material class -
// with no classes in the profile, Settings > Fabrics offered type "" and the row was saved.

describe("fabricSaveError - the gate of fabrics:save", () => {
  it("a named fabric with a class may be saved", () => {
    expect(fabricSaveError({ name: "Poplin", type: "Cottons" })).toBeNull();
    expect(fabricSaveError({ name: "Poplin", type: "Cotton" })).toBeNull(); // a renamed class is a class
  });

  it("no class: refused, pointing at the shop profile", () => {
    for (const type of ["", "   ", undefined, null, 3]) {
      expect(fabricSaveError({ name: "Poplin", type })).toMatch(/^Choose a material class for the fabric\..*Settings > Shop Profile/);
    }
  });

  it("no name: refused as before", () => {
    for (const name of ["", "  ", undefined]) expect(fabricSaveError({ name, type: "Cottons" })).toBe("Fabric name is required.");
    expect(fabricSaveError(undefined)).toBe("Fabric name is required.");
  });
});
