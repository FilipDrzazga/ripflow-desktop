import { describe, it, expect } from "vitest";
import { fabricSaveError, fabricListError, fabricAddError, withProfilePrinterCode } from "./fabricInput.js";

// dlug-2. D7: the preferred printer is compared with the profile ignoring case (getPrinterByCode
// does the same) and stored the way the profile spells it. D9: an ADD of a name that has a row is
// refused instead of overwriting the row.

const printers = [
  { code: "DGEN", materialClass: "Cottons" },
  { code: "YOKO", materialClass: "Polyesters" },
];
const poly = (preferredPrinter) => ({ name: "Eco Satin Flow", type: "Polyesters", preferredPrinter });

describe("fabricSaveError - the printer code ignores case (D7)", () => {
  it("a lower or mixed case code of a printer of the class is accepted", () => {
    expect(fabricSaveError(poly("yoko"), printers)).toBeNull();
    expect(fabricSaveError(poly("Yoko"), printers)).toBeNull();
  });

  it("the class check still applies, and names the printer as the profile spells it", () => {
    expect(fabricSaveError(poly("dgen"), printers)).toBe(
      "Preferred printer DGEN prints Cottons, not Polyesters. Choose a printer of the fabric's class, or none.",
    );
  });

  it("an unknown code is still refused, quoted as typed", () => {
    expect(fabricSaveError(poly("mimaki"), printers)).toMatch(/^Preferred printer "mimaki" is not a printer in the shop profile/);
  });

  it("a profile row with no usable code does not match anything", () => {
    expect(fabricSaveError(poly("yoko"), [null, { materialClass: "Polyesters" }, { code: 7, materialClass: "Polyesters" }])).toMatch(
      /is not a printer in the shop profile/,
    );
  });

  it("setAll applies the same comparison per row", () => {
    expect(fabricListError([poly("yoko")], printers)).toBeNull();
  });
});

describe("withProfilePrinterCode (D7)", () => {
  it("writes the code the way the profile spells it", () => {
    expect(withProfilePrinterCode(poly("yoko"), printers)).toEqual(poly("YOKO"));
    expect(withProfilePrinterCode(poly("Yoko"), printers).preferredPrinter).toBe("YOKO");
  });

  it("does not touch the input object", () => {
    const given = poly("yoko");
    withProfilePrinterCode(given, printers);
    expect(given.preferredPrinter).toBe("yoko");
  });

  it("returns the same object when there is nothing to fix", () => {
    const right = poly("YOKO");
    expect(withProfilePrinterCode(right, printers)).toBe(right);
    for (const none of [undefined, null, ""]) {
      const fabric = poly(none);
      expect(withProfilePrinterCode(fabric, printers)).toBe(fabric);
    }
    const unsent = { name: "Eco Satin Flow", type: "Polyesters" };
    expect(withProfilePrinterCode(unsent, printers)).toBe(unsent);
  });

  it("leaves a code the profile does not know alone (fabricSaveError refuses it before)", () => {
    const unknown = poly("mimaki");
    expect(withProfilePrinterCode(unknown, printers)).toBe(unknown);
    expect(withProfilePrinterCode(poly("yoko"), [])).toEqual(poly("yoko"));
  });
});

describe("fabricAddError (D9)", () => {
  const existing = [{ name: "Poplin" }, { name: "Eco Satin Flow" }];

  it("an add of a name that has a row is refused, naming it", () => {
    expect(fabricAddError(null, { name: "Poplin" }, existing)).toBe(
      'A material named "Poplin" already exists. Edit that one instead, or choose another name.',
    );
    expect(fabricAddError(undefined, { name: "Poplin" }, existing)).toMatch(/already exists/);
    expect(fabricAddError("", { name: "Poplin" }, existing)).toMatch(/already exists/);
  });

  it("an add of a new name passes", () => {
    expect(fabricAddError(null, { name: "Organza" }, existing)).toBeNull();
    expect(fabricAddError(null, { name: "Poplin" }, [])).toBeNull();
  });

  it("an edit passes - with or without a rename, as before", () => {
    expect(fabricAddError("Poplin", { name: "Poplin" }, existing)).toBeNull();
    expect(fabricAddError("Poplin", { name: "Organza" }, existing)).toBeNull();
  });

  it("names compare exactly, like the primary key", () => {
    expect(fabricAddError(null, { name: "poplin" }, existing)).toBeNull();
  });

  it("an unreadable catalogue (null) leaves the write to fail by itself", () => {
    expect(fabricAddError(null, { name: "Poplin" }, null)).toBeNull();
  });
});
