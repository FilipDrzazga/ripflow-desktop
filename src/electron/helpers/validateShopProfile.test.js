import { describe, it, expect } from "vitest";
import { validateShopProfile, MAX_SEWING_COMPANY_LENGTH } from "./validateShopProfile.js";

// ETAP 3-2: the import validator. VALID is a complete profile of a made-up shop (not Alex's:
// DEFAULT_PROFILE becomes an empty skeleton in 3-6, and this suite must not depend on it). Each
// test breaks ONE thing in a copy and asserts the exact error it produces - the rule, the place
// and nothing else - so a rule that stops firing, or starts firing on valid data, fails here.

const VALID = {
  schemaVersion: 3,
  printers: [
    { code: "MIMAKI1", materialClass: "Cottons", hotfolder: "HOT_COTTON", color: { bg: "#E6F1FB", text: "#0C447C" } },
    { code: "EPSON", materialClass: "Polyesters", hotfolder: "HOT-POLY" },
  ],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 0, defaultRollWidth: 1600 },
  ],
  productTypes: [
    { code: "SAMPLE", width: 200, height: 200 },
    { code: "FQ", width: 500, height: 500 },
    { code: "TEA_TOWEL", width: 700, height: 500 },
  ],
  folders: { printed: "PRINTED", ripError: "RIP_ERRORS", customOrder: "CUSTOM" },
  scanRules: [
    { role: "press", from: "printed", to: "heatpress", notifyWhenEmpty: true },
    { role: "qc", from: "heatpress", to: "qc" },
  ],
  sewingCompanies: ["Stitch Co"],
  integrations: { shopify: { storeHandle: "client-two" } },
  features: {
    customOrders: true,
    analytics: true,
    ripErrors: true,
    labelPrinting: false,
    shopify: true,
    sewing: true,
  },
};

const V = { schemaVersion: 3 };
const errorsOf = (mutate) => {
  const p = structuredClone(VALID);
  mutate(p);
  return validateShopProfile(p, V).errors;
};

describe("validateShopProfile - a complete, consistent profile", () => {
  it("passes with no errors", () => {
    expect(validateShopProfile(structuredClone(VALID), V)).toEqual({ ok: true, errors: [] });
  });

  it("passes with every feature off and nothing behind them", () => {
    expect(
      errorsOf((p) => {
        for (const f of Object.keys(p.features)) p.features[f] = false;
        p.sewingCompanies = [];
        p.integrations.shopify.storeHandle = "";
        p.folders = {};
      }),
    ).toEqual([]);
  });

  it("refuses something that is not an object", () => {
    for (const bad of [null, [], "x", 3]) {
      expect(validateShopProfile(bad, V)).toEqual({ ok: false, errors: ["The profile must be a JSON object."] });
    }
  });
});

describe("validateShopProfile - schemaVersion is checked first and alone", () => {
  it("a newer file is refused, with nothing else reported", () => {
    const errs = errorsOf((p) => {
      p.schemaVersion = 4;
      p.printers = [];
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^schemaVersion: 4 is newer than/);
  });

  it("a file older than any export (< 3) is refused", () => {
    for (const old of [1, 2]) {
      const errs = errorsOf((p) => (p.schemaVersion = old));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/is older than any exported profile \(3\)/);
    }
  });

  it("a missing or non-integer version is refused", () => {
    for (const bad of [undefined, "3", 3.5]) {
      const errs = errorsOf((p) => (p.schemaVersion = bad));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/^schemaVersion: must be an integer/);
    }
  });

  it("an exportable but older version must be migrated by the caller first", () => {
    const res = validateShopProfile(structuredClone(VALID), { schemaVersion: 4 });
    expect(res.errors).toEqual(["schemaVersion: 3 must be migrated to 4 before validation."]);
  });
});

describe("validateShopProfile - keys", () => {
  it("an unknown top-level key is refused", () => {
    expect(errorsOf((p) => (p.workstationRoles = ["qc"]))).toEqual(['profile: unknown key "workstationRoles".']);
  });

  it("a missing top-level key is refused", () => {
    expect(errorsOf((p) => delete p.productTypes)).toEqual(['profile: missing key "productTypes".']);
  });

  it("an unknown key inside a record is refused", () => {
    expect(errorsOf((p) => (p.printers[0].defaultXmlWidth = 1420))).toEqual([
      'printers[0]: unknown key "defaultXmlWidth".',
    ]);
  });

  it("reports every error, not the first one", () => {
    expect(
      errorsOf((p) => {
        p.printers[0].code = "bad-code";
        p.materialClasses[1].margin = -1;
      }),
    ).toHaveLength(2);
  });
});

describe("validateShopProfile - printers", () => {
  it("must be a non-empty list", () => {
    expect(errorsOf((p) => (p.printers = []))).toEqual([
      "printers: must be a non-empty list - without a printer nothing can be printed.",
    ]);
  });

  it("a code with a dash, an underscore or lower case is refused (batch folder name)", () => {
    for (const code of ["MIMAKI-2", "MIMAKI_2", "mimaki"]) {
      const errs = errorsOf((p) => (p.printers[0].code = code));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/^printers\[0\]\.code: must be capital letters and digits only/);
    }
  });

  it("a code listed twice is refused", () => {
    expect(errorsOf((p) => (p.printers[1].code = "MIMAKI1"))).toEqual(['printers[1].code: "MIMAKI1" is listed twice.']);
  });

  it("materialClass must be one of materialClasses", () => {
    expect(errorsOf((p) => (p.printers[1].materialClass = "Silks"))).toEqual([
      'printers[1].materialClass: "Silks" is not in materialClasses.',
    ]);
  });

  it("the hotfolder must be one folder name", () => {
    for (const bad of ["..\\evil", "a/b", "", "X.Y"]) {
      const errs = errorsOf((p) => (p.printers[0].hotfolder = bad));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/^printers\[0\]\.hotfolder: must be one folder name/);
    }
  });

  it("colours must be hex", () => {
    expect(errorsOf((p) => (p.printers[0].color = { bg: "red", text: "#000" }))).toEqual([
      'printers[0].color.bg: must be a hex colour like "#E6F1FB" (got "red").',
    ]);
  });
});

describe("validateShopProfile - materialClasses and productTypes", () => {
  it("class numbers must be numbers in range", () => {
    expect(
      errorsOf((p) => {
        p.materialClasses[0].margin = "10";
        p.materialClasses[1].defaultRollWidth = 0;
      }),
    ).toEqual([
      'materialClasses[0].margin: must be a number >= 0 (got "10").',
      "materialClasses[1].defaultRollWidth: must be a number > 0 (got 0).",
    ]);
  });

});

describe("validateShopProfile - folders and scanRules", () => {
  it("a folder value must be one folder name", () => {
    expect(errorsOf((p) => (p.folders.customOrder = "..\\x"))).toEqual([
      'folders.customOrder: must be one folder name - letters, digits, "_" or "-" (got "..\\\\x").',
      "features.customOrders is on, but folders.customOrder is not set.",
    ]);
  });

  it("scan rule stages must be production stages", () => {
    expect(errorsOf((p) => (p.scanRules[0].to = "pressing"))).toEqual([
      `scanRules[0].to: must be one of printed, heatpress, qc, to_sewing, from_sewing, packed, shipped, rejected, overridden (got "pressing").`,
    ]);
  });

  it("a role with two rules is refused", () => {
    expect(errorsOf((p) => (p.scanRules[1].role = "press"))).toEqual([
      'scanRules[1].role: "press" has two rules - only the first would ever apply.',
    ]);
  });

  it("an empty role and a non-boolean notifyWhenEmpty are refused", () => {
    expect(
      errorsOf((p) => {
        p.scanRules[0].role = " ";
        p.scanRules[1].notifyWhenEmpty = "false";
      }),
    ).toEqual(["scanRules[0].role: must be a non-empty text.", 'scanRules[1].notifyWhenEmpty: must be true or false (got "false").']);
  });
});

describe("validateShopProfile - sewingCompanies", () => {
  it("duplicates are refused, ignoring case and outer spaces", () => {
    expect(errorsOf((p) => p.sewingCompanies.push("stitch co"))).toEqual(['sewingCompanies[1]: "stitch co" is listed twice.']);
  });

  it("a name longer than the limit is refused", () => {
    expect(errorsOf((p) => p.sewingCompanies.push("x".repeat(MAX_SEWING_COMPANY_LENGTH + 1)))).toEqual([
      `sewingCompanies[1]: longer than ${MAX_SEWING_COMPANY_LENGTH} characters - it is shown on production cards.`,
    ]);
    expect(errorsOf((p) => p.sewingCompanies.push("x".repeat(MAX_SEWING_COMPANY_LENGTH)))).toEqual([]);
  });

  it("blank names and outer spaces are refused", () => {
    expect(
      errorsOf((p) => {
        p.sewingCompanies.push("  ");
        p.sewingCompanies.push(" Seams ");
      }),
    ).toEqual(["sewingCompanies[1]: must be a non-empty text.", 'sewingCompanies[2]: " Seams " has spaces at the start or end.']);
  });
});

describe("validateShopProfile - features and what they need", () => {
  it("a flag that is not a real boolean is refused (getFeature would read it as off)", () => {
    expect(errorsOf((p) => (p.features.analytics = "true"))).toEqual(['features.analytics: must be true or false (got "true").']);
  });

  it("a missing or unknown flag is refused", () => {
    expect(
      errorsOf((p) => {
        delete p.features.labelPrinting;
        p.features.reports = true;
      }),
    ).toEqual(['features: unknown key "reports".', "features.labelPrinting: must be true or false (got undefined)."]);
  });

  it("shopify on requires a store handle", () => {
    expect(errorsOf((p) => (p.integrations.shopify.storeHandle = ""))).toEqual([
      "features.shopify is on, but integrations.shopify.storeHandle is empty.",
    ]);
  });

  it("a store handle that is not URL-shaped is refused", () => {
    expect(errorsOf((p) => (p.integrations.shopify.storeHandle = "My Store/x"))).toEqual([
      'integrations.shopify.storeHandle: must be lower-case letters, digits and "-" (got "My Store/x").',
      "features.shopify is on, but integrations.shopify.storeHandle is empty.",
    ]);
  });

  it("sewing on requires a sewing company", () => {
    expect(errorsOf((p) => (p.sewingCompanies = []))).toEqual(["features.sewing is on, but sewingCompanies is empty."]);
  });

  it("ripErrors on requires folders.ripError", () => {
    expect(errorsOf((p) => delete p.folders.ripError)).toEqual(["features.ripErrors is on, but folders.ripError is not set."]);
  });

  it("customOrders on requires folders.customOrder", () => {
    expect(errorsOf((p) => delete p.folders.customOrder)).toEqual([
      "features.customOrders is on, but folders.customOrder is not set.",
    ]);
  });
});
