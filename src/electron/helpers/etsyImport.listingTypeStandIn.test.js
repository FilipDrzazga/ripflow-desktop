import { describe, it, expect, vi } from "vitest";

// S2 review 11:03, W2: the print type remembered for a listing STANDS IN when no variation of the order line reads as a
// print type - it never overrides one that does. Same harness as etsyImport.listingType.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf, PROFILE } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const LISTING = "1234567890";
const WITH_PRODUCTS = { productTypes: [...PROFILE.productTypes, { code: "SNOOD", width: 500, height: 700 }, { code: "APRON", width: 500, height: 700 }] };
// A snood listing as Etsy sends it: a Fabric and a size that is not a print type.
const adultSnood = () =>
  lm({
    variations: [
      { formatted_name: "Fabric", formatted_value: "Drill" },
      { formatted_name: "Size", formatted_value: "Adult" },
    ],
  });

const setup = (types, over = {}) =>
  setupImporter({ parse: parsePrintFileName, getProfile: () => WITH_PRODUCTS, getListingType: (id) => types[id] ?? null, ...over });

describe("the remembered type as a stand-in", () => {
  it("a variation that is not a print type (Size: Adult) does not block it - the line imports as a snood", async () => {
    const t = setup({ [LISTING]: "SNOOD" });
    t.setReceipts([receipt([adultSnood()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1 });
    expect(inboxOf(t.disk, "Drill")[0]).toContain("_3x_Snood_XWD");
  });

  it("a variation that IS a print type decides, whatever is remembered - for every type a person can remember", async () => {
    for (const code of ["SNOOD", "APRON"]) {
      const t = setup({ [LISTING]: code });
      t.setReceipts([receipt([lm()])]);
      await t.tick();
      expect(inboxOf(t.disk, "Drill")[0]).toContain("Linear Meter");
    }
  });

  it("when the remembered type cannot be used the reason names the remembered type and the parser's refusal, not 'no variation'", async () => {
    const t = setup({ [LISTING]: "APRON" }, { getProfile: () => PROFILE });
    t.setReceipts([receipt([adultSnood()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    const reason = t.imports.rows.get(KEY).reason;
    expect(reason).toContain("The print type remembered for this listing (Apron) cannot be used");
    expect(reason).toContain("UNKNOWN_PRODUCT_SIZE");
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("nothing remembered and no type variation: the line still stops with the old reason", async () => {
    const t = setup({});
    t.setReceipts([receipt([adultSnood()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY).reason).toContain("No variation reads as a print type");
  });
});
