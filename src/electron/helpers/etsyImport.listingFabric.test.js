import { describe, it, expect, vi } from "vitest";

// Plan FAB: the fabric a person chose for a LISTING (etsy_listing_fabric) stands in for the order line's "Fabric"
// variation when that is missing or does not resolve - and only then. Same isolation of the parser as
// etsyImport.retry.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const LISTING = "1234567890"; // the testkit line's listing_id
const noFabricVariation = () => lm({ variations: [{ formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] });
const unknownFabric = () =>
  lm({
    variations: [
      { formatted_name: "Fabric", formatted_value: "Moon Silk" },
      { formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" },
    ],
  });

const setup = (remembered, over = {}) => {
  const getListingFabric = vi.fn((listingId) => remembered[listingId] ?? null);
  return { getListingFabric, ...setupImporter({ parse: parsePrintFileName, getListingFabric, ...over }) };
};

describe("a remembered fabric for the listing", () => {
  it("imports a line with no Fabric variation into the remembered fabric's folder", async () => {
    const t = setup({ [LISTING]: "Calico Plain Cotton" });
    t.setReceipts([receipt([noFabricVariation()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1, needsReview: 0 });
    expect(inboxOf(t.disk, "Calico Plain Cotton")).toHaveLength(1);
    expect(inboxOf(t.disk, "Calico Plain Cotton")[0]).toContain("_Calico Plain Cotton_3x_");
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE, folder: "Calico Plain Cotton" });
    expect(t.getListingFabric).toHaveBeenCalledWith(LISTING);
  });

  it("also steps in for a Fabric variation that does not resolve", async () => {
    const t = setup({ [LISTING]: "Calico Plain Cotton" });
    t.setReceipts([receipt([unknownFabric()])]);
    await t.tick();
    expect(inboxOf(t.disk, "Calico Plain Cotton")).toHaveLength(1);
  });

  it("never overrides a Fabric variation that resolves", async () => {
    const t = setup({ [LISTING]: "Calico Plain Cotton" });
    t.setReceipts([receipt([lm()])]); // the line says Drill
    await t.tick();
    expect(inboxOf(t.disk, "Drill")).toHaveLength(1);
    expect(inboxOf(t.disk, "Calico Plain Cotton")).toEqual([]);
    expect(t.getListingFabric).not.toHaveBeenCalled();
  });

  it("a remembered fabric the catalogue no longer has stops the line with that reason - never another fabric", async () => {
    const t = setup({ [LISTING]: "Velvet" });
    t.setReceipts([receipt([noFabricVariation()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    expect(t.imports.rows.get(KEY).reason).toBe('The fabric "Velvet" remembered for this listing is not in Fabrics (any more).');
    expect(t.disk.calls.copy).toBe(0);
  });

  it("nothing remembered: the line stops with the variation's own reason, as before", async () => {
    const t = setup({});
    t.setReceipts([receipt([noFabricVariation()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason: 'The order line has no "Fabric" variation.' });
  });

  it("nothing remembered and a variation that does not resolve: that reason, not a generic one", async () => {
    const t = setup({});
    t.setReceipts([receipt([unknownFabric()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY).reason).toContain('Etsy fabric "Moon Silk" is not in Fabrics');
  });

  it("a RETRY of a stopped line picks the remembered fabric up", async () => {
    const t = setup({ [LISTING]: "Calico Plain Cotton" });
    t.imports.putRetry({});
    t.setReceipts([receipt([noFabricVariation()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1 });
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE, folder: "Calico Plain Cotton" });
  });

  it("an importer wired without the memory behaves as before (the dependency is optional)", async () => {
    const t = setupImporter({ parse: parsePrintFileName });
    t.setReceipts([receipt([noFabricVariation()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY).reason).toBe('The order line has no "Fabric" variation.');
  });
});
