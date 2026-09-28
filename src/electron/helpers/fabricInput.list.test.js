import { describe, it, expect } from "vitest";
import { fabricListError } from "./fabricInput.js";

// ETAP 4 (4-types-d, S2 at 4-types-b): fabrics:setAll - the gate of fabrics:save for every row.
// The first bad row refuses the whole list, and the message names that row.

describe("fabricListError - the gate of fabrics:setAll", () => {
  it("a list where every row has a name and a class passes (an empty list too)", () => {
    expect(fabricListError([{ name: "Poplin", type: "Cottons" }, { name: "Crepe", type: "Poly" }])).toBeNull();
    expect(fabricListError([])).toBeNull();
  });

  it("a row with no class refuses the whole list, naming the row (1-based) and the fabric", () => {
    expect(fabricListError([{ name: "Poplin", type: "Cottons" }, { name: "Crepe", type: "" }])).toMatch(
      /^Row 2 \("Crepe"\): Choose a material class for the fabric\..* Nothing was saved\.$/,
    );
  });

  it("the FIRST bad row is the one reported", () => {
    expect(fabricListError([{ name: "", type: "Cottons" }, { name: "Crepe", type: "" }])).toBe(
      "Row 1: Fabric name is required. Nothing was saved.",
    );
  });

  it("not an array: refused as before", () => {
    expect(fabricListError("x")).toBe("Fabrics must be an array.");
  });
});
