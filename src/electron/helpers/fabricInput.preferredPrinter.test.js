import { describe, it, expect } from "vitest";
import { fabricSaveError, fabricListError, preferredPrinterToStore } from "./fabricInput.js";

// A fabric's preferred printer must be a printer of the fabric's OWN class in the shop profile:
// anything else would pre-select, in Print, a printer the bar keeps disabled for that class.

const printers = [
  { code: "DGEN", materialClass: "Cottons" },
  { code: "YOKO", materialClass: "Polyesters" },
  { code: "YUMI", materialClass: "Polyesters" },
];
const poly = (preferredPrinter) => ({ name: "Eco Satin Flow", type: "Polyesters", preferredPrinter });

describe("fabricSaveError - preferred printer", () => {
  it("none is fine, with or without a profile", () => {
    for (const p of [undefined, null, ""]) {
      expect(fabricSaveError(poly(p), printers)).toBeNull();
      expect(fabricSaveError(poly(p), [])).toBeNull();
    }
  });

  it("a printer of the fabric's class is accepted", () => {
    expect(fabricSaveError(poly("YOKO"), printers)).toBeNull();
    expect(fabricSaveError(poly("YUMI"), printers)).toBeNull();
  });

  it("a printer of another class is refused, naming both classes", () => {
    expect(fabricSaveError(poly("DGEN"), printers)).toBe(
      "Preferred printer DGEN prints Cottons, not Polyesters. Choose a printer of the fabric's class, or none.",
    );
  });

  it("a code the profile does not have - or no readable profile at all - is refused", () => {
    expect(fabricSaveError(poly("MIMAKI"), printers)).toMatch(/^Preferred printer "MIMAKI" is not a printer in the shop profile/);
    expect(fabricSaveError(poly("YOKO"), [])).toMatch(/^Preferred printer "YOKO" is not a printer in the shop profile/);
    expect(fabricSaveError(poly("YOKO"), undefined)).toMatch(/is not a printer in the shop profile/);
  });

  it("not a string is refused", () => {
    expect(fabricSaveError(poly(3), printers)).toBe("Preferred printer must be a printer code.");
  });

  it("setAll: the first bad row names itself and refuses the list", () => {
    const list = [poly("YOKO"), { name: "Poplin", type: "Cottons", preferredPrinter: "YUMI" }];
    expect(fabricListError(list, printers)).toMatch(/^Row 2 \("Poplin"\): Preferred printer YUMI prints Polyesters, not Cottons\./);
  });
});

describe("preferredPrinterToStore", () => {
  it("not sent keeps the row's value; null or empty clears; a code is stored", () => {
    expect(preferredPrinterToStore(undefined, "YOKO")).toBe("YOKO");
    expect(preferredPrinterToStore(undefined, undefined)).toBeNull();
    expect(preferredPrinterToStore(null, "YOKO")).toBeNull();
    expect(preferredPrinterToStore("", "YOKO")).toBeNull();
    expect(preferredPrinterToStore("YUMI", "YOKO")).toBe("YUMI");
  });
});
