import { describe, it, expect } from "vitest";
import { migrateShopProfile } from "./migrateShopProfile.js";
import { validateShopProfile } from "./validateShopProfile.js";

// ETAP 4 (4-types-c): v3 -> v4 - the material class of custom orders becomes profile data,
// customOrders.materialClass. Every v3 row meant "custom orders are Polyesters" (the literal in
// the code); the step writes that down only when the row HAS a Polyesters class, else null.

const v3Row = (classes = ["Cottons", "Polyesters"]) => ({
  schemaVersion: 3,
  printers: [{ code: "YOKO", materialClass: "Polyesters" }],
  materialClasses: classes.map((name) => ({ name, margin: 5, defaultRollWidth: 1550 })),
  features: { customOrders: true },
});

describe("migrateShopProfile v3 -> v4 (customOrders.materialClass)", () => {
  it("a row with a Polyesters class: Polyesters, bumped to v4, nothing else touched", () => {
    const row = v3Row();
    const { profile, changed, applied } = migrateShopProfile(row);
    expect(changed).toBe(true);
    expect(profile.schemaVersion).toBe(4);
    expect(profile.customOrders).toEqual({ materialClass: "Polyesters" });
    expect(applied).toEqual(["customOrders.materialClass = Polyesters", "set schemaVersion 3 -> 4"]);
    expect(profile.printers).toEqual(row.printers);
    expect(profile.materialClasses).toEqual(row.materialClasses);
  });

  it("a row without that class (renamed classes): null - custom orders refuse, nothing is guessed", () => {
    const { profile } = migrateShopProfile(v3Row(["Cotton", "Poly"]));
    expect(profile.customOrders).toEqual({ materialClass: null });
    expect(profile.schemaVersion).toBe(4);
  });

  it("no materialClasses at all: null", () => {
    expect(migrateShopProfile({ schemaVersion: 3 }).profile.customOrders).toEqual({ materialClass: null });
  });

  it("a v3 row that already carries the field keeps it", () => {
    const row = { ...v3Row(), customOrders: { materialClass: "Cottons" } };
    const { profile, skipped } = migrateShopProfile(row);
    expect(profile.customOrders).toEqual({ materialClass: "Cottons" });
    expect(skipped).toContain("customOrders.materialClass already set - left as it is");
    expect(profile.schemaVersion).toBe(4);
  });

  it("idempotent: a v4 row is left alone - no write", () => {
    const once = migrateShopProfile(v3Row()).profile;
    const twice = migrateShopProfile(once);
    expect(twice.changed).toBe(false);
    expect(twice.profile).toBe(once);
  });

  it("the input row is not mutated", () => {
    const row = v3Row();
    const before = structuredClone(row);
    migrateShopProfile(row);
    expect(row).toEqual(before);
  });

  it("needs no outside data: runs without fabric_globals (the import preview passes none)", () => {
    const { profile, blocked } = migrateShopProfile(v3Row(), { fabricGlobals: null });
    expect(blocked).toBeNull();
    expect(profile.schemaVersion).toBe(4);
  });
});

describe("validateShopProfile - customOrders (v4)", () => {
  const V = { schemaVersion: 4 };
  const errorsOf = (customOrders) => {
    const base = migrateShopProfile(v3Row()).profile;
    return validateShopProfile({ ...base, customOrders }, V).errors.filter((e) => e.startsWith("customOrders"));
  };

  it("null or a class of the profile is accepted", () => {
    expect(errorsOf({ materialClass: null })).toEqual([]);
    expect(errorsOf({ materialClass: "Polyesters" })).toEqual([]);
  });

  it("a class the profile does not have, a missing key, an unknown key or a non-object is refused", () => {
    expect(errorsOf({ materialClass: "Silk" })).toEqual([
      'customOrders.materialClass: must be null or one of the materialClasses names (got "Silk").',
    ]);
    expect(errorsOf({})).toHaveLength(1);
    expect(errorsOf({ materialClass: null, extra: 1 })).toEqual(['customOrders: unknown key "extra".']);
    expect(errorsOf("Polyesters")).toEqual(["customOrders: must be an object."]);
  });
});
