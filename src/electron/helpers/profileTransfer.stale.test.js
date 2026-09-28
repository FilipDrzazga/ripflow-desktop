import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 3-4 (S2 2026-09-28 09:43): the import preview says when THIS station's loaded profile is not
// the stored row. The apply writes through the 3-1 CAS against what the station loaded, so a stale
// station can only get PROFILE_CHANGED - the operator is told before the click.

const h = vi.hoisted(() => ({ row: null }));

vi.mock("./db.js", () => ({
  getShopProfile: () => (h.row === null ? null : JSON.parse(h.row)),
  getShopProfileRaw: () => h.row,
  migrateShopProfileRow: () => ({ updated: false }),
  getAllFileStages: () => [],
  dumpShopProfileBlob: () => ({ success: true, path: "x" }),
  backupDb: async () => ({ success: true, path: "y" }),
}));

import { previewShopProfileImport, resetPendingImport } from "./profileTransfer.js";
import { loadShopProfile, invalidateShopProfile } from "./shopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
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
};

const io = () => ({
  chooseOpenPath: async () => "C:/p.json",
  statSize: async () => 10,
  readFile: async () => JSON.stringify(PROFILE),
});

beforeEach(() => {
  resetPendingImport();
  h.row = JSON.stringify(PROFILE);
  invalidateShopProfile();
  loadShopProfile();
});

describe("previewShopProfileImport - stationStale", () => {
  it("false when this station holds the stored row", async () => {
    expect((await previewShopProfileImport(io())).stationStale).toBe(false);
  });

  it("false when the stored row differs only in key order", async () => {
    h.row = JSON.stringify(Object.fromEntries(Object.entries(PROFILE).reverse()));
    expect((await previewShopProfileImport(io())).stationStale).toBe(false);
  });

  it("true when another station saved after this one loaded", async () => {
    h.row = JSON.stringify({ ...PROFILE, sewingCompanies: ["Saved Elsewhere"] });
    expect((await previewShopProfileImport(io())).stationStale).toBe(true);
  });

  it("true when this station never loaded a profile", async () => {
    invalidateShopProfile();
    expect((await previewShopProfileImport(io())).stationStale).toBe(true);
  });

  it("true when this station holds the stand-in for a missing row - even when the row now equals it", async () => {
    h.row = null;
    invalidateShopProfile();
    loadShopProfile(); // no row -> DEFAULT_PROFILE stands in
    // The row seeded since carries the same content (Alex's case today): equal as data, but the
    // CAS refuses a stand-in baseline, so the preview must still say stale.
    h.row = JSON.stringify(DEFAULT_PROFILE);
    expect((await previewShopProfileImport(io())).stationStale).toBe(true);
  });
});
