import { describe, it, expect } from "vitest";
import { validateShopProfile, MAX_MATERIAL_CLASSES } from "./validateShopProfile.js";

// ETAP 4 (4-types-d): the import validator stops requiring Alex's closed lists.
// - materialClasses: one or two classes, named by the shop, unique, not "Unknown";
// - productTypes: the SUBSET of the parser's codes the shop makes (a code outside them is refused);
// - customOrders.materialClass required when custom orders are on (a v4 rule).
// Five tests of validateShopProfile.test.js pinned the old closed lists and were deleted; what
// was still a rule in them (a class listed twice, a code the parser does not read, positive
// dimensions) is re-proven here. Same method: break ONE thing, assert the exact errors.

const VALID = {
  schemaVersion: 4,
  printers: [
    { code: "MIMAKI1", materialClass: "Cotton", hotfolder: "HOT_COTTON" },
    { code: "EPSON", materialClass: "Poly", hotfolder: "HOT_POLY" },
  ],
  materialClasses: [
    { name: "Cotton", margin: 10, defaultRollWidth: 1420 },
    { name: "Poly", margin: 0, defaultRollWidth: 1600 },
  ],
  productTypes: [
    { code: "SAMPLE", width: 200, height: 200 },
    { code: "FQ", width: 500, height: 500 },
  ],
  folders: { printed: "PRINTED", ripError: "RIP_ERRORS", customOrder: "CUSTOM" },
  scanRules: [{ role: "press", from: "printed", to: "heatpress" }],
  sewingCompanies: [],
  customOrders: { materialClass: "Poly" },
  integrations: { shopify: { storeHandle: "" } },
  features: { customOrders: true, analytics: true, ripErrors: true, labelPrinting: false, shopify: false, sewing: false },
};
const V = { schemaVersion: 4 };
const errorsOf = (mutate) => {
  const p = structuredClone(VALID);
  mutate(p);
  return validateShopProfile(p, V).errors;
};

describe("validateShopProfile v4 - named classes and a subset of product types", () => {
  it("a shop with its own class names and only two product types passes", () => {
    expect(validateShopProfile(structuredClone(VALID), V)).toEqual({ ok: true, errors: [] });
  });

  it("one class is enough", () => {
    expect(
      errorsOf((p) => {
        p.materialClasses = [p.materialClasses[0]];
        p.printers = [p.printers[0]];
        p.customOrders.materialClass = "Cotton";
      }),
    ).toEqual([]);
  });

  it("no product type at all is allowed (a shop printing LM and cushions only)", () => {
    expect(errorsOf((p) => (p.productTypes = []))).toEqual([]);
  });

  it("more than two classes is refused - the third is frozen until client #2", () => {
    expect(MAX_MATERIAL_CLASSES).toBe(2);
    expect(errorsOf((p) => p.materialClasses.push({ name: "Silk", margin: 5, defaultRollWidth: 1500 }))).toEqual([
      "materialClasses: at most 2 classes (got 3).",
    ]);
  });

  it("a class listed twice is refused", () => {
    expect(errorsOf((p) => (p.materialClasses[1].name = "Cotton"))).toEqual([
      'materialClasses[1].name: "Cotton" is listed twice.',
      'printers[1].materialClass: "Poly" is not in materialClasses.',
      'customOrders.materialClass: must be null or one of the materialClasses names (got "Poly").',
    ]);
  });

  it('"Unknown" is reserved, in any case', () => {
    for (const name of ["Unknown", "unknown"]) {
      expect(
        errorsOf((p) => {
          p.materialClasses[0].name = name;
          p.printers[0].materialClass = name;
        }),
      ).toEqual([`materialClasses[0].name: "${name}" is reserved - it is the class of a fabric outside the catalogue.`, `printers[0].materialClass: "${name}" is not in materialClasses.`]);
    }
  });

  it("an empty name or one with outer spaces is refused", () => {
    for (const name of ["", " Cotton", 3]) {
      expect(errorsOf((p) => (p.materialClasses[0].name = name))[0]).toBe(
        `materialClasses[0].name: must be a name without outer spaces (got ${JSON.stringify(name)}).`,
      );
    }
  });

  it("a product code the parser does not read is still refused", () => {
    expect(errorsOf((p) => (p.productTypes[0].code = "CUSHION"))).toEqual([
      'productTypes[0].code: must be one of SAMPLE, FQ, TEA_TOWEL (got "CUSHION").',
    ]);
  });

  it("a product type's dimensions must still be positive", () => {
    expect(errorsOf((p) => (p.productTypes[0].height = -5))).toEqual(["productTypes[0].height: must be a number > 0 (got -5)."]);
  });
});

describe("validateShopProfile v4 - custom orders need their class", () => {
  it("custom orders on and no class: refused", () => {
    expect(errorsOf((p) => (p.customOrders.materialClass = null))).toEqual([
      "features.customOrders is on, but customOrders.materialClass is not set.",
    ]);
    expect(errorsOf((p) => delete p.customOrders)).toEqual(["features.customOrders is on, but customOrders.materialClass is not set."]);
  });

  it("custom orders off: the class may be null", () => {
    expect(
      errorsOf((p) => {
        p.features.customOrders = false;
        p.customOrders.materialClass = null;
      }),
    ).toEqual([]);
  });
});
