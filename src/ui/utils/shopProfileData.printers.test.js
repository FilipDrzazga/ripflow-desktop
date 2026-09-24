import { describe, it, expect } from "vitest";
import { getPrinters, defaultPrinterFor } from "./shopProfileData.js";
import { DEFAULT_PROFILE } from "../../electron/helpers/defaultProfile.js";

// ETAP 2e step 3: the renderer's printer lists (print view, BatchHistory and Analytics
// filters, custom-order card) come from profile.printers through this reader.
// A separate file so shopProfileData.test.js stays untouched (productization rule 7).

describe("getPrinters", () => {
  it("reads Alex's seed as the three printers the constants used to list, in order", () => {
    expect(getPrinters(DEFAULT_PROFILE)).toEqual([
      { code: "DGEN", materialClass: "Cottons" },
      { code: "YOKO", materialClass: "Polyesters" },
      { code: "YUMI", materialClass: "Polyesters" },
    ]);
  });

  it("offers nothing when the profile could not be read or carries no list", () => {
    expect(getPrinters(null)).toEqual([]);
    expect(getPrinters(undefined)).toEqual([]);
    expect(getPrinters({})).toEqual([]);
    expect(getPrinters({ printers: "DGEN" })).toEqual([]);
  });

  it("drops rows it cannot use instead of guessing", () => {
    const profile = {
      printers: [
        null,
        "DGEN",
        { code: "", materialClass: "Cottons" },
        { code: "DG-EN", materialClass: "Cottons" }, // not a batch-folder code
        { code: "YOKO_1", materialClass: "Polyesters" }, // "_" is the collision suffix
        { code: "YOKO" }, // no class to lock the material against
        { code: "YOKO", materialClass: "   " },
        { code: 7, materialClass: "Cottons" },
        { code: " mimaki2 ", materialClass: " Silk " },
      ],
    };
    expect(getPrinters(profile)).toEqual([{ code: "MIMAKI2", materialClass: "Silk" }]);
  });

  it("keeps the first row of a code that appears twice (any case)", () => {
    const profile = {
      printers: [
        { code: "DGEN", materialClass: "Cottons" },
        { code: "dgen", materialClass: "Polyesters" },
      ],
    };
    expect(getPrinters(profile)).toEqual([{ code: "DGEN", materialClass: "Cottons" }]);
  });
});

describe("defaultPrinterFor", () => {
  const seed = getPrinters(DEFAULT_PROFILE);

  it("reproduces the removed rule on Alex's seed: Cottons -> DGEN, Polyesters -> none", () => {
    expect(defaultPrinterFor(seed, "Cottons")).toBe("DGEN");
    expect(defaultPrinterFor(seed, "Polyesters")).toBeNull();
  });

  it("no default for a class without a printer, Unknown, or no class", () => {
    expect(defaultPrinterFor(seed, "Silk")).toBeNull();
    expect(defaultPrinterFor(seed, "Unknown")).toBeNull();
    expect(defaultPrinterFor(seed, null)).toBeNull();
    expect(defaultPrinterFor(seed, "")).toBeNull();
    expect(defaultPrinterFor([], "Cottons")).toBeNull();
    expect(defaultPrinterFor(null, "Cottons")).toBeNull();
  });
});
