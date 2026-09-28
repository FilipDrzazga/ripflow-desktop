import { describe, it, expect, vi, beforeEach } from "vitest";

// ETAP 4 (4-types-c): getCustomOrderClass in main and in the renderer answer the same - the
// profile's customOrders.materialClass, or null (no profile, no field, not a non-empty string).

const h = vi.hoisted(() => ({ row: null, throws: false }));
vi.mock("./db.js", () => ({
  getShopProfile: () => {
    if (h.throws) throw new Error("db down");
    return h.row;
  },
}));

import { loadShopProfile, invalidateShopProfile, getCustomOrderClass } from "./shopProfile.js";
import { getCustomOrderClass as rendererClass } from "../../ui/utils/shopProfileData.js";

const CASES = [
  [{ customOrders: { materialClass: "Polyesters" } }, "Polyesters"],
  [{ customOrders: { materialClass: "Poly" } }, "Poly"],
  [{ customOrders: { materialClass: null } }, null],
  [{ customOrders: { materialClass: "  " } }, null],
  [{ customOrders: { materialClass: 3 } }, null],
  [{ customOrders: {} }, null],
  [{}, null],
];

beforeEach(() => {
  h.row = null;
  h.throws = false;
  invalidateShopProfile();
});

describe("getCustomOrderClass", () => {
  it("main and renderer read the field the same way", () => {
    for (const [profile, want] of CASES) {
      h.row = profile;
      invalidateShopProfile();
      loadShopProfile();
      expect(getCustomOrderClass()).toBe(want);
      expect(rendererClass(profile)).toBe(want);
    }
  });

  it("an unreadable profile gives null in both (no stand-in)", () => {
    h.throws = true;
    loadShopProfile();
    expect(getCustomOrderClass()).toBeNull();
    expect(rendererClass(null)).toBeNull();
  });
});
