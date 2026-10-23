import { describe, it, expect, vi } from "vitest";

// A snood and an apron are print types an Etsy line may read back as (FILIP 2026-10-23) - when the shop profile
// has their size. Same isolation of the parser as etsyImport.retry.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf, PROFILE } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const WITH_SNOOD = { productTypes: [...PROFILE.productTypes, { code: "SNOOD", width: 500, height: 700 }, { code: "APRON", width: 500, height: 700 }] };
const line = (typeText) =>
  lm({
    variations: [
      { formatted_name: "Fabric", formatted_value: "Drill" },
      { formatted_name: "Product", formatted_value: typeText },
    ],
  });

describe("a line whose type text is a snood or an apron", () => {
  it.each([
    ["Snood", "SNOOD"],
    ["Apron", "APRON"],
  ])("%s imports when the profile has its size", async (typeText, code) => {
    const t = setupImporter({ parse: parsePrintFileName, getProfile: () => WITH_SNOOD });
    t.setReceipts([receipt([line(typeText)])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1, needsReview: 0 });
    const [name] = inboxOf(t.disk, "Drill");
    expect(name).toContain(`_${typeText}_XWD173706_`);
    expect(parsePrintFileName(name, { shopConfig: WITH_SNOOD })).toMatchObject({ printTypeCode: code, width: 500, height: 700, qty: 3 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
  });

  it("stops at NEEDS_REVIEW when the profile has no size for it - the parser refuses, nothing is copied", async () => {
    const t = setupImporter({ parse: parsePrintFileName });
    t.setReceipts([receipt([line("Snood")])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    expect(t.imports.rows.get(KEY).reason).toContain("UNKNOWN_PRODUCT_SIZE");
    expect(t.disk.calls.copy).toBe(0);
  });
});
