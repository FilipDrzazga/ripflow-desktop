import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-types-a): getEstimateConfig in the main process carries the class numbers BY NAME
// ({ classes, fabrics }), read from the profile as it is at the call - the three removed tests of
// fabricCache.estimateConfig.test.js pinned the old four-key `globals`. Same edges mocked.
let fabrics;
let profile;

vi.mock("./db.js", () => ({ getAllFabrics: () => fabrics }));
vi.mock("./shopProfile.js", () => ({ getProfile: () => profile }));

import { loadFabricCache, invalidateFabricCache, getEstimateConfig } from "./fabricCache.js";

const PROFILE = { materialClasses: [{ name: "Cottons", margin: 12, defaultRollWidth: 1460 }, { name: "Polyesters", margin: 6, defaultRollWidth: 1600 }] };
const CATALOGUE = [{ name: "Poplin", type: "Cottons", rollWidth: 1420 }];

beforeEach(() => {
  fabrics = CATALOGUE;
  profile = PROFILE;
  invalidateFabricCache();
});

describe("getEstimateConfig - classes by name (main)", () => {
  it("profile + catalogue: the classes of the PROFILE", () => {
    loadFabricCache();
    expect(getEstimateConfig()).toEqual({
      classes: { Cottons: { margin: 12, defaultRollWidth: 1460 }, Polyesters: { margin: 6, defaultRollWidth: 1600 } },
      fabrics: CATALOGUE,
    });
  });

  it("profile null + catalogue: { classes: {}, fabrics } - class constants, catalogue kept", () => {
    profile = null;
    loadFabricCache();
    expect(getEstimateConfig()).toEqual({ classes: {}, fabrics: CATALOGUE });
  });

  it("the numbers follow the profile as it is NOW - no copy is cached", () => {
    loadFabricCache();
    profile = { materialClasses: [{ name: "Cotton", margin: 20, defaultRollWidth: 1420 }] };
    expect(getEstimateConfig().classes).toEqual({ Cotton: { margin: 20, defaultRollWidth: 1420 } });
  });
});
