import { describe, it, expect } from "vitest";
import { validateShopProfile, FEATURE_FLAGS, OPTIONAL_FEATURE_FLAGS } from "./validateShopProfile.js";

// E3b-1: features.etsy is an OPTIONAL flag - a profile may omit it (off, like getFeature reads a missing key),
// so every exported v4 file still imports and the schema version did not move. When present it is a boolean.

const VALID = {
  schemaVersion: 4,
  printers: [{ code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_COTTON" }],
  materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }],
  productTypes: [{ code: "SAMPLE", width: 200, height: 200 }],
  folders: { printed: "PRINTED", ripError: "RIP_ERRORS", customOrder: "CUSTOM" },
  scanRules: [],
  sewingCompanies: [],
  customOrders: { materialClass: null },
  integrations: { shopify: { storeHandle: "" } },
  features: { customOrders: false, analytics: false, ripErrors: false, labelPrinting: false, shopify: false, sewing: false },
};

const errorsOf = (mutate) => {
  const p = structuredClone(VALID);
  mutate(p);
  return validateShopProfile(p, { schemaVersion: 4 }).errors;
};

describe("validateShopProfile - the optional etsy flag", () => {
  it("the required list is unchanged and etsy is the optional one", () => {
    expect(FEATURE_FLAGS).not.toContain("etsy");
    expect(OPTIONAL_FEATURE_FLAGS).toEqual(["etsy"]);
  });

  it("a profile without etsy, with etsy false and with etsy true is valid", () => {
    expect(errorsOf(() => {})).toEqual([]);
    expect(errorsOf((p) => (p.features.etsy = false))).toEqual([]);
    expect(errorsOf((p) => (p.features.etsy = true))).toEqual([]);
  });

  it("refuses a flag that is not a real boolean", () => {
    expect(errorsOf((p) => (p.features.etsy = "true"))).toEqual(['features.etsy: must be true or false (got "true").']);
    expect(errorsOf((p) => (p.features.etsy = 1))).toEqual(["features.etsy: must be true or false (got 1)."]);
    expect(errorsOf((p) => (p.features.etsy = null))).toEqual(["features.etsy: must be true or false (got null)."]);
  });

  it("an unknown flag is still refused, and a required flag is still required", () => {
    expect(errorsOf((p) => (p.features.reports = true))).toEqual(['features: unknown key "reports".']);
    expect(
      errorsOf((p) => {
        p.features.etsy = true;
        delete p.features.sewing;
      }),
    ).toEqual(["features.sewing: must be true or false (got undefined)."]);
  });
});
