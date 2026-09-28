import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-stale): a preview on a STALE station holds no token, so no apply can run. Before, the
// preview only flagged stationStale; the apply then made the pre-import dump and a full database
// backup over SMB and only after that ended in the CAS refusal (PROFILE_CHANGED).

const h = vi.hoisted(() => ({ row: null, dumps: 0, backups: 0, writes: 0 }));

vi.mock("./db.js", () => ({
  getShopProfile: () => (h.row === null ? null : JSON.parse(h.row)),
  getShopProfileRaw: () => h.row,
  migrateShopProfileRow: () => {
    h.writes += 1;
    return { updated: true };
  },
  getAllFileStages: () => [],
  dumpShopProfileBlob: () => {
    h.dumps += 1;
    return { success: true, path: "x" };
  },
  backupDb: async () => {
    h.backups += 1;
    return { success: true, path: "y" };
  },
}));

import { previewShopProfileImport, applyShopProfileImport, resetPendingImport } from "./profileTransfer.js";
import { loadShopProfile, invalidateShopProfile } from "./shopProfile.js";

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
// the file differs from the stored row, so the preview is not "unchanged"
const FILE = { ...PROFILE, sewingCompanies: ["From The File"] };

const io = () => ({
  chooseOpenPath: async () => "C:/p.json",
  statSize: async () => 10,
  readFile: async () => JSON.stringify(FILE),
});

beforeEach(() => {
  resetPendingImport();
  h.row = JSON.stringify(PROFILE);
  h.dumps = 0;
  h.backups = 0;
  h.writes = 0;
  invalidateShopProfile();
  loadShopProfile();
});

describe("import on a stale station - no token, no apply", () => {
  it("a fresh station gets a token and its apply writes (the path the stale case must not reach)", async () => {
    const preview = await previewShopProfileImport(io());
    expect(preview.stationStale).toBe(false);
    expect(typeof preview.token).toBe("string");
    const res = await applyShopProfileImport(preview.token, { workstation: "PC1" });
    expect(res.success).toBe(true);
    expect([h.dumps, h.backups, h.writes]).toEqual([1, 1, 1]);
  });

  it("a stale station gets no token", async () => {
    h.row = JSON.stringify({ ...PROFILE, sewingCompanies: ["Saved Elsewhere"] });
    const preview = await previewShopProfileImport(io());
    expect(preview.valid).toBe(true);
    expect(preview.stationStale).toBe(true);
    expect(preview.token).toBeNull();
  });

  it("nothing is pending after a stale preview: no dump, no backup, no write", async () => {
    h.row = JSON.stringify({ ...PROFILE, sewingCompanies: ["Saved Elsewhere"] });
    const preview = await previewShopProfileImport(io());
    const res = await applyShopProfileImport(preview.token, { workstation: "PC1" });
    expect(res.success).toBe(false);
    expect([h.dumps, h.backups, h.writes]).toEqual([0, 0, 0]);
  });

  it("a stale preview also drops an earlier pending import", async () => {
    const fresh = await previewShopProfileImport(io());
    h.row = JSON.stringify({ ...PROFILE, sewingCompanies: ["Saved Elsewhere"] });
    await previewShopProfileImport(io());
    const res = await applyShopProfileImport(fresh.token, { workstation: "PC1" });
    expect(res.success).toBe(false);
    expect([h.dumps, h.backups, h.writes]).toEqual([0, 0, 0]);
  });
});
