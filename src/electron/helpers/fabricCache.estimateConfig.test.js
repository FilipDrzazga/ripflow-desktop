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
  it("profile + catalogue: globals from the PROFILE's materialClasses", () => {
    loadFabricCache();
    expect(getEstimateConfig()).toEqual({
      globals: { marginCotton: 12, defaultRollWidthCotton: 1460, marginPoly: 6, defaultRollWidthPoly: 1600 },
      fabrics: CATALOGUE,
    });
  });

  it("profile null + catalogue: { globals: {}, fabrics } - class constants, catalogue kept", () => {
    profile = null;
    loadFabricCache();
    expect(getEstimateConfig()).toEqual({ globals: {}, fabrics: CATALOGUE });
  });

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

  it("the numbers follow the profile as it is NOW (profile:set reloads it) - no copy is cached", () => {
    loadFabricCache();
    profile = { materialClasses: [{ name: "Cottons", margin: 20, defaultRollWidth: 1420 }] };
    expect(getEstimateConfig().globals).toEqual({ marginCotton: 20, defaultRollWidthCotton: 1420 });
  });
});
