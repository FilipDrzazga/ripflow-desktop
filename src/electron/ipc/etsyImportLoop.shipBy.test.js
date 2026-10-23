import { describe, it, expect, vi, afterEach } from "vitest";

// The loop hands the engine db.js's setEtsyImportShipBy as `imports.setShipBy` (plan ETA) - without it the engine
// keeps importing but never refreshes a ship-by date, which no engine test would see. Harness as in
// etsyImportLoop.importOrder.test.js: every part mocked, the engine a stub that keeps its deps.
const engine = vi.hoisted(() => ({ deps: null }));
const db = vi.hoisted(() => ({ setEtsyImportShipBy: () => "the db function", getEtsyImport: () => null }));

vi.mock("./etsyHandlers.js", () => ({ getEtsyParts: () => ({ credentials: { status: () => ({ connected: true, shopId: 777 }) }, client: {} }) }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY" }), getEtsyImportSince: () => null }));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => "C:\\storage" }));
vi.mock("../helpers/shopProfile.js", () => ({ getProfile: () => ({}), getFeature: () => true }));
vi.mock("../helpers/db.js", () => ({
  isDbOpen: () => true,
  getAllFabrics: () => [],
  getEtsyFabricMap: () => [],
  getEtsyListingFabric: () => null,
  getEtsyListingType: () => null,
  getEtsyImport: db.getEtsyImport,
  claimEtsyImport: () => true,
  setEtsyImportState: () => true,
  moveEtsyImport: () => true,
  listEtsyImportRetries: () => null,
  setEtsyImportShipBy: db.setEtsyImportShipBy,
  setEtsyImportBuyerNote: () => null,
}));
vi.mock("../helpers/renameNoOverwrite.js", () => ({ renameNoOverwrite: async () => {} }));
vi.mock("../helpers/parseFileName.js", () => ({ parsePrintFileName: () => null }));
vi.mock("../helpers/etsyImport.js", () => ({
  createEtsyImporter: (deps) => {
    engine.deps = deps;
    return Object.assign(async () => ({ ran: false }), { importReceipt: async () => ({ ran: false }) });
  },
}));

import { startEtsyImportLoop } from "./etsyImportLoop.js";

let stop = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe("the import table the loop hands the engine", () => {
  it("carries setShipBy = setEtsyImportShipBy, next to get", () => {
    stop = startEtsyImportLoop({ isPaused: () => false });
    expect(engine.deps.imports.setShipBy).toBe(db.setEtsyImportShipBy);
    expect(engine.deps.imports.get).toBe(db.getEtsyImport);
  });
});
