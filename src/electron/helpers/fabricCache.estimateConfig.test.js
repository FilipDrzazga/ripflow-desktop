import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 2g-3b: getEstimateConfig in the main process - the class numbers from the shop profile,
// the catalogue from the DB. The two edges (db.js, shopProfile.js) are mocked; the cache is real.
let fabrics;
let fabricsThrows;
let profile;

vi.mock("./db.js", () => ({
  getAllFabrics: () => {
    if (fabricsThrows) throw new Error("db down");
    return fabrics;
  },
}));
vi.mock("./shopProfile.js", () => ({ getProfile: () => profile }));

import { loadFabricCache, invalidateFabricCache, getEstimateConfig } from "./fabricCache.js";

const PROFILE = { materialClasses: [{ name: "Cottons", margin: 12, defaultRollWidth: 1460 }, { name: "Polyesters", margin: 6, defaultRollWidth: 1600 }] };
const CATALOGUE = [{ name: "Poplin", type: "Cottons", rollWidth: 1420 }];

beforeEach(() => {
  fabrics = CATALOGUE;
  fabricsThrows = false;
  profile = PROFILE;
  invalidateFabricCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getEstimateConfig - sentinel matrix (main)", () => {
  it("catalogue unreadable (null or a throw): null, never { fabrics: [] } (rule 23)", () => {
    fabrics = null;
    loadFabricCache();
    expect(getEstimateConfig()).toBeNull();
    fabricsThrows = true;
    loadFabricCache();
    expect(getEstimateConfig()).toBeNull();
  });

  it("both unreadable: null", () => {
    fabrics = null;
    profile = null;
    loadFabricCache();
    expect(getEstimateConfig()).toBeNull();
  });

  it("cache not loaded yet: null", () => {
    expect(getEstimateConfig()).toBeNull();
  });

});
