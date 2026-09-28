import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 3-3: export and the two-phase import. Everything real except db.js - saveShopProfile (the
// 3-1 CAS), the profile cache and the validator run as in the app. The fake DB holds ONE profile
// row as text, the file_stages rows, and records the dump and the backup, so the order "dump, then
// backup, then CAS write" and "no dump = nothing written" are visible from the outside.

const h = vi.hoisted(() => ({
  row: null,
  stages: [],
  dumpOk: true,
  backupOk: true,
  calls: [],
}));

vi.mock("./db.js", () => ({
  getShopProfile: () => (h.row === null ? null : JSON.parse(h.row)),
  getShopProfileRaw: () => h.row,
  migrateShopProfileRow: (expectedJson, nextJson) => {
    h.calls.push("write");
    if (h.row !== expectedJson) return { updated: false };
    h.row = nextJson;
    return { updated: true };
  },
  getAllFileStages: () => h.stages,
  dumpShopProfileBlob: (raw, version) => {
    h.calls.push(`dump:${version}`);
    h.dumped = raw;
    return h.dumpOk ? { success: true, path: "C:/backups/dump.json" } : { success: false, error: "disk full" };
  },
  backupDb: async (force) => {
    h.calls.push(`backup:${force}`);
    return h.backupOk ? { success: true, path: "C:/backups/ripflow.db" } : { success: false, error: "SMB gone" };
  },
}));

import {
  exportShopProfile,
  previewShopProfileImport,
  applyShopProfileImport,
  resetPendingImport,
  MAX_PROFILE_FILE_BYTES,
} from "./profileTransfer.js";
import { loadShopProfile, invalidateShopProfile, getProfile } from "./shopProfile.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

// The stored profile (shop A) and a valid candidate file (shop A reconfigured).
const STORED = {
  schemaVersion: 3,
  printers: [
    { code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C" },
    { code: "YOKO", materialClass: "Polyesters", hotfolder: "HOT_P" },
  ],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "TEA_TOWEL", width: 700, height: 500 },
  ],
  folders: { printed: "PRINTED", ripError: "ERR", customOrder: "CUSTOM" },
  scanRules: [{ role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false }],
  sewingCompanies: ["Olya", "Vagabond"],
  integrations: { shopify: { storeHandle: "shop-a" } },
  features: { customOrders: true, analytics: true, ripErrors: true, labelPrinting: true, shopify: true, sewing: true },
};
const CANDIDATE = {
  ...structuredClone(STORED),
  printers: [
    { code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C" },
    { code: "MIMAKI", materialClass: "Polyesters", hotfolder: "HOT_P" },
  ],
  sewingCompanies: ["Vagabond"],
  features: { ...STORED.features, analytics: false },
};

const io = (text, { path = "C:\\Users\\op\\profile.json", size } = {}) => ({
  chooseOpenPath: vi.fn(async () => path),
  statSize: vi.fn(async () => size ?? Buffer.byteLength(text ?? "")),
  readFile: vi.fn(async () => text),
});

beforeEach(() => {
  h.row = JSON.stringify(STORED);
  h.stages = [];
  h.dumpOk = true;
  h.backupOk = true;
  h.calls = [];
  h.dumped = null;
  resetPendingImport();
  invalidateShopProfile();
  loadShopProfile();
});

describe("exportShopProfile", () => {
  it("writes the DATABASE row, not this station's cache, pretty-printed", async () => {
    h.row = JSON.stringify({ ...STORED, sewingCompanies: ["Saved Elsewhere"] }); // cache still holds STORED
    const writeFile = vi.fn(async () => {});
    const res = await exportShopProfile({ chooseSavePath: async () => "C:/out.json", writeFile });
    expect(res).toMatchObject({ success: true, canceled: false, path: "C:/out.json" });
    const [, content] = writeFile.mock.calls[0];
    expect(JSON.parse(content).sewingCompanies).toEqual(["Saved Elsewhere"]);
    expect(content).toBe(JSON.stringify(JSON.parse(h.row), null, 2) + "\n");
  });

  it("offers a dated default name, and a cancelled dialog writes nothing", async () => {
    const chooseSavePath = vi.fn(async () => null);
    const writeFile = vi.fn();
    expect(await exportShopProfile({ chooseSavePath, writeFile })).toEqual({ success: true, canceled: true });
    expect(chooseSavePath.mock.calls[0][0]).toMatch(/^shop-profile-\d{4}-\d{2}-\d{2}\.json$/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("exports a profile that would not import back, and says why", async () => {
    h.row = JSON.stringify({ ...STORED, sewingCompanies: [] });
    const res = await exportShopProfile({ chooseSavePath: async () => "C:/out.json", writeFile: async () => {} });
    expect(res.success).toBe(true);
    expect(res.warnings).toEqual(["features.sewing is on, but sewingCompanies is empty."]);
  });

  it("refuses when there is no row to export", async () => {
    h.row = null;
    const writeFile = vi.fn();
    const res = await exportShopProfile({ chooseSavePath: async () => "C:/out.json", writeFile });
    expect(res.success).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("previewShopProfileImport", () => {
  it("a cancelled dialog reads nothing", async () => {
    const d = io("");
    d.chooseOpenPath = vi.fn(async () => null);
    expect(await previewShopProfileImport(d)).toEqual({ success: true, canceled: true });
    expect(d.readFile).not.toHaveBeenCalled();
  });

  it("invalid JSON is reported, not thrown", async () => {
    const res = await previewShopProfileImport(io("{ nope"));
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/^The file is not valid JSON/);
  });

  it("an oversized file is refused before it is read", async () => {
    const d = io("{}", { size: MAX_PROFILE_FILE_BYTES + 1 });
    const res = await previewShopProfileImport(d);
    expect(res.valid).toBe(false);
    expect(d.readFile).not.toHaveBeenCalled();
  });

  it("a profile that fails validation gets the validator's errors and no token", async () => {
    const res = await previewShopProfileImport(io(JSON.stringify({ ...CANDIDATE, schemaVersion: 2 })));
    expect(res).toMatchObject({ success: true, valid: false });
    expect(res.errors).toHaveLength(1);
    expect(res.token).toBeUndefined();
  });

  it("accepts a UTF-8 BOM (Notepad saves one)", async () => {
    const res = await previewShopProfileImport(io("\uFEFF" + JSON.stringify(CANDIDATE)));
    expect(res.valid).toBe(true);
  });

  it("a valid file gets a token, the diff against the stored row, and the impact on the data", async () => {
    h.stages = [
      { printer: "YOKO", stage: "printed", sewing_company: null },
      { printer: "YOKO", stage: "shipped", sewing_company: null },
      { printer: "DGEN", stage: "to_sewing", sewing_company: "Olya" },
      { printer: "DGEN", stage: "packed", sewing_company: "Olya" },
      { printer: "DGEN", stage: "to_sewing", sewing_company: "Vagabond" },
    ];
    const res = await previewShopProfileImport(io(JSON.stringify(CANDIDATE)));
    expect(res).toMatchObject({ success: true, valid: true, fileName: "profile.json", unchanged: false });
    expect(typeof res.token).toBe("string");
    expect(res.diff).toMatchObject({
      changedSections: ["printers", "sewingCompanies", "features"],
      printersAdded: ["MIMAKI"],
      printersRemoved: ["YOKO"],
      sewingCompaniesRemoved: ["Olya"],
      featuresTurnedOff: ["analytics"],
      featuresTurnedOn: [],
    });
    expect(res.impact).toEqual({
      stageRowsCounted: 5,
      byRemovedPrinter: { YOKO: 2 },
      atSewingByRemovedCompany: { Olya: 1 },
    });
  });

  it("the same profile as stored reads as unchanged", async () => {
    const res = await previewShopProfileImport(io(JSON.stringify(STORED)));
    expect(res.unchanged).toBe(true);
    expect(res.diff.changedSections).toEqual([]);
  });

  it("never writes anything", async () => {
    await previewShopProfileImport(io(JSON.stringify(CANDIDATE)));
    expect(h.calls).toEqual([]);
    expect(h.row).toBe(JSON.stringify(STORED));
  });
});

describe("applyShopProfileImport", () => {
  const previewed = async () => (await previewShopProfileImport(io(JSON.stringify(CANDIDATE)))).token;

  it("dumps the stored row, backs up, then writes through the CAS and reloads the cache", async () => {
    const token = await previewed();
    const res = await applyShopProfileImport(token, { workstation: "PC-1" });
    expect(res).toMatchObject({ success: true, dumpPath: "C:/backups/dump.json", backup: { success: true } });
    expect(h.calls).toEqual(["dump:3-import", "backup:true", "write"]);
    expect(h.dumped).toBe(JSON.stringify(STORED));
    expect(JSON.parse(h.row)).toEqual(CANDIDATE);
    expect(getProfile()).toEqual(CANDIDATE);
  });

  it("no dump, no import: nothing is backed up or written", async () => {
    const token = await previewed();
    h.dumpOk = false;
    const res = await applyShopProfileImport(token, { workstation: "PC-1" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/disk full/);
    expect(h.calls).toEqual(["dump:3-import"]);
    expect(h.row).toBe(JSON.stringify(STORED));
  });

  it("a failed backup does not stop the import, and is reported", async () => {
    const token = await previewed();
    h.backupOk = false;
    const res = await applyShopProfileImport(token, { workstation: "PC-1" });
    expect(res.success).toBe(true);
    expect(res.backup).toEqual({ success: false, error: "SMB gone" });
  });

  it("another station saved after this one loaded: PROFILE_CHANGED, their row stays", async () => {
    const token = await previewed();
    h.row = JSON.stringify({ ...STORED, sewingCompanies: ["Saved Elsewhere"] });
    const res = await applyShopProfileImport(token, { workstation: "PC-1" });
    expect(res.code).toBe(PROFILE_CHANGED);
    expect(JSON.parse(h.row).sewingCompanies).toEqual(["Saved Elsewhere"]);
  });

  it("needs the token of the pending preview", async () => {
    await previewed();
    const res = await applyShopProfileImport("forged", { workstation: "PC-1" });
    expect(res.success).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("a token is used once, and a new preview replaces the pending one", async () => {
    const first = await previewed();
    const second = await previewed();
    expect((await applyShopProfileImport(first, { workstation: "PC-1" })).success).toBe(false);
    // the failed attempt consumed the pending import too
    expect((await applyShopProfileImport(second, { workstation: "PC-1" })).success).toBe(false);
    const third = await previewed();
    expect((await applyShopProfileImport(third, { workstation: "PC-1" })).success).toBe(true);
    expect((await applyShopProfileImport(third, { workstation: "PC-1" })).success).toBe(false);
  });

  it("a preview that failed validation leaves nothing to apply", async () => {
    const token = await previewed();
    await previewShopProfileImport(io("{ nope"));
    expect((await applyShopProfileImport(token, { workstation: "PC-1" })).success).toBe(false);
  });
});
