import { describe, it, expect, vi } from "vitest";

// Plan FAB-3c: the print type a person chose for a LISTING (etsy_listing_type) is the type of its lines - a snood, an
// apron, whose order line names none - and the file name must read back as exactly that type. Same isolation of the
// parser as etsyImport.retry.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf, PROFILE } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const LISTING = "1234567890"; // the testkit line's listing_id
const WITH_PRODUCTS = { productTypes: [...PROFILE.productTypes, { code: "SNOOD", width: 500, height: 700 }, { code: "APRON", width: 500, height: 700 }] };
// A snood listing: a Fabric variation at most, and nothing that names the print type.
const snoodLine = (over = {}) => lm({ variations: [{ formatted_name: "Fabric", formatted_value: "Drill" }], ...over });

const setup = (types, over = {}) => {
  const getListingType = vi.fn((listingId) => types[listingId] ?? null);
  return { getListingType, ...setupImporter({ parse: parsePrintFileName, getProfile: () => WITH_PRODUCTS, getListingType, ...over }) };
};

describe("a print type remembered for the listing", () => {
  it.each([
    ["SNOOD", "Snood"],
    ["APRON", "Apron"],
  ])("%s: a line whose variations name no type imports as that type", async (code, label) => {
    const t = setup({ [LISTING]: code });
    t.setReceipts([receipt([snoodLine()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1, needsReview: 0 });
    const [name] = inboxOf(t.disk, "Drill");
    expect(name).toContain(`_3x_${label}_XWD173706_`);
    expect(parsePrintFileName(name, { shopConfig: WITH_PRODUCTS })).toMatchObject({ printTypeCode: code, width: 500, height: 700, qty: 3, status: "READY" });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(t.getListingType).toHaveBeenCalledWith(LISTING);
  });

  it("never overrides a variation that reads as a type - one wrong click must not turn a metre listing into snoods (S2 W2)", async () => {
    const t = setup({ [LISTING]: "SNOOD" });
    t.setReceipts([receipt([lm()])]); // Fabric Drill + "Linear Meter - 1m increments"
    await t.tick();
    const [name] = inboxOf(t.disk, "Drill");
    expect(name).toContain("Linear Meter");
    expect(name).not.toContain("_Snood_XWD");
  });

  it("with the profile lacking the type's size the line stops with the parser's refusal, nothing copied", async () => {
    const t = setup({ [LISTING]: "APRON" }, { getProfile: () => PROFILE });
    t.setReceipts([receipt([snoodLine()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    expect(t.imports.rows.get(KEY).reason).toContain("UNKNOWN_PRODUCT_SIZE");
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a stored code a person can no longer choose is no memory: the variations decide", async () => {
    const t = setup({ [LISTING]: "CUSHION" });
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(inboxOf(t.disk, "Drill")[0]).toContain("Linear Meter");
  });

  it("nothing remembered: a line with no type variation stops as before", async () => {
    const t = setup({});
    t.setReceipts([receipt([snoodLine()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.imports.rows.get(KEY).reason).toContain("no variation that could name the print type");
  });

  it("a RETRY of a stopped line picks the remembered type up", async () => {
    const t = setup({ [LISTING]: "SNOOD" });
    t.imports.putRetry({});
    t.setReceipts([receipt([snoodLine()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1 });
    expect(inboxOf(t.disk, "Drill")[0]).toContain("_Snood_XWD");
  });

  it("together with a remembered fabric a snood listing with no variations at all imports", async () => {
    const t = setup({ [LISTING]: "SNOOD" }, { getListingFabric: () => "Calico Plain Cotton" });
    t.setReceipts([receipt([lm({ variations: [] })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1 });
    expect(inboxOf(t.disk, "Calico Plain Cotton")[0]).toContain("_Calico Plain Cotton_3x_Snood_XWD");
  });

  it("the name is proved before the claim: a parser that reads it back as another type stops the line, nothing copied (W4)", () => {
    const misreading = (name, options) => ({ ...parsePrintFileName(name, options), printTypeCode: "SAMPLE" });
    const t = setup({ [LISTING]: "SNOOD" }, { parse: misreading });
    t.setReceipts([receipt([snoodLine()])]);
    return t.tick().then((out) => {
      expect(out).toMatchObject({ imported: 0, needsReview: 1 });
      expect(t.imports.rows.get(KEY).reason).toContain("it reads back with a different print type");
      expect(t.disk.calls.copy).toBe(0);
    });
  });

  it("an importer wired without the memory behaves as before (the dependency is optional)", async () => {
    const t = setupImporter({ parse: parsePrintFileName });
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(inboxOf(t.disk, "Drill")[0]).toContain("Linear Meter");
  });
});
