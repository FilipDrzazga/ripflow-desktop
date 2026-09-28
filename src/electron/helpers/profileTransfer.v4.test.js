import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-types-c): the import preview migrates a v3 file through migrateShopProfile - the same
// steps the stored row takes at startup - before validating it. A v3 file with a Polyesters class
// arrives with customOrders.materialClass = "Polyesters", one without it with null; the apply
// writes the migrated v4 profile.

const h = vi.hoisted(() => ({ row: null, written: null }));

vi.mock("./db.js", () => ({
  getShopProfile: () => (h.row === null ? null : JSON.parse(h.row)),
  getShopProfileRaw: () => h.row,
  migrateShopProfileRow: (_expected, next) => {
    h.written = next;
    h.row = next;
    return { updated: true };
  },
  getAllFileStages: () => [],
  dumpShopProfileBlob: () => ({ success: true, path: "x" }),
  backupDb: async () => ({ success: true, path: "y" }),
}));

import { previewShopProfileImport, applyShopProfileImport, resetPendingImport } from "./profileTransfer.js";
import { loadShopProfile, invalidateShopProfile } from "./shopProfile.js";

const profile = (schemaVersion, classes, extra = {}) => ({
  schemaVersion,
  printers: classes.map((name, i) => ({ code: `P${i}`, materialClass: name, hotfolder: `HOT${i}` })),
  materialClasses: classes.map((name) => ({ name, margin: 5, defaultRollWidth: 1550 })),
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "TEA_TOWEL", width: 700, height: 500 },
  ],
  folders: {},
  scanRules: [],
  sewingCompanies: [],
  integrations: { shopify: { storeHandle: "" } },
  features: { customOrders: false, analytics: true, ripErrors: false, labelPrinting: false, shopify: false, sewing: false },
  ...extra,
});
const STORED = profile(4, ["Cottons", "Polyesters"], { customOrders: { materialClass: "Polyesters" } });

const io = (file) => ({
  chooseOpenPath: async () => "C:/p.json",
  statSize: async () => 10,
  readFile: async () => JSON.stringify(file),
});

beforeEach(() => {
  resetPendingImport();
  h.row = JSON.stringify(STORED);
  h.written = null;
  invalidateShopProfile();
  loadShopProfile();
});

describe("import of a v3 file - migrated to v4 by the startup steps", () => {
  it("a v3 file with Polyesters: valid, and written as v4 with customOrders.materialClass = Polyesters", async () => {
    const file = profile(3, ["Cottons", "Polyesters"], { sewingCompanies: ["New Co"] });
    const preview = await previewShopProfileImport(io(file));
    expect(preview.valid).toBe(true);
    await applyShopProfileImport(preview.token, { workstation: "PC" });
    const written = JSON.parse(h.written);
    expect(written.schemaVersion).toBe(4);
    expect(written.customOrders).toEqual({ materialClass: "Polyesters" });
  });

  // A v3 file WITHOUT a Polyesters class cannot be imported yet - the validator still requires
  // Cottons and Polyesters until 4-types-d. Its null is proven on the step itself
  // (migrateShopProfile.v4.test.js), which is the function the preview calls.

  it("the stored profile re-imported from its own v3 export reads as unchanged", async () => {
    const rest = { ...STORED };
    delete rest.customOrders;
    const preview = await previewShopProfileImport(io({ ...rest, schemaVersion: 3 }));
    expect(preview.unchanged).toBe(true);
  });
});
