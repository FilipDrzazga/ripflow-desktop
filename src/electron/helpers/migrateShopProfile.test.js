import { describe, it, expect } from "vitest";
import { migrateShopProfile, PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

// No mocks anywhere in this file, and that is the point of the module's shape:
// migrateShopProfile has zero imports, so nothing has to be replaced to reach it.

// The shape measured on the live database on 2026-09-10: seeded 2026-08-27 by a build
// that predated 2eeaa26, so it carries workstationRoles and has never heard of scanRules.
const alexRow = () => ({
  schemaVersion: 1,
  printers: [{ code: "DGEN", materialClass: "Cottons" }],
  materialClasses: [{ name: "Cottons", margin: 10 }],
  workstationRoles: ["", "cotton", "polyester", "rollpress", "qc"],
  sewingCompanies: ["Olya", "Vagabond"],
  features: { shopify: true },
});

describe("migrateShopProfile - a pre-2f row", () => {
  it("drops workstationRoles and installs the four frozen scan rules", () => {
    const { profile, changed, applied, skipped } = migrateShopProfile(alexRow());

    expect(changed).toBe(true);
    expect(profile.workstationRoles).toBeUndefined();
    expect(profile.scanRules).toEqual([
      { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
      { role: "polyester", from: "printed", to: "heatpress", notifyWhenEmpty: true },
      { role: "rollpress", from: "heatpress", to: "qc", notifyWhenEmpty: true },
      { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
    ]);
    expect(profile.schemaVersion).toBe(2);
    expect(applied).toContain("drop workstationRoles");
    expect(applied).toContain("add scanRules (4 frozen 2f rules)");
    expect(applied).toContain("set schemaVersion 1 -> 2");
    expect(skipped).toEqual([]);
  });

  it("leaves every other key untouched", () => {
    const { profile } = migrateShopProfile(alexRow());
    expect(profile.printers).toEqual([{ code: "DGEN", materialClass: "Cottons" }]);
    expect(profile.sewingCompanies).toEqual(["Olya", "Vagabond"]);
    expect(profile.features).toEqual({ shopify: true });
  });

  it("does not mutate the row it was given", () => {
    const row = alexRow();
    migrateShopProfile(row);
    expect(row.workstationRoles).toEqual(["", "cotton", "polyester", "rollpress", "qc"]);
    expect(row.scanRules).toBeUndefined();
    expect(row.schemaVersion).toBe(1);
  });

  it("hands out a copy of the frozen rules, so one caller cannot poison the next", () => {
    const first = migrateShopProfile(alexRow()).profile;
    first.scanRules[0].to = "shipped";
    const second = migrateShopProfile(alexRow()).profile;
    expect(second.scanRules[0].to).toBe("heatpress");
  });
});

describe("migrateShopProfile - rows that must NOT receive another shop's rules", () => {
  // The bc68fbe line, moved to write time: a row that never carried workstationRoles is
  // not the pre-2f seed, so we have no evidence about which transitions belong to it.
  it("refuses to invent scanRules for a row that never had workstationRoles", () => {
    const { profile, changed, applied, skipped } = migrateShopProfile({
      schemaVersion: 1,
      printers: [],
    });

    expect(changed).toBe(true); // the version still moves
    expect(profile.scanRules).toBeUndefined();
    expect(applied).toEqual(["set schemaVersion 1 -> 2"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/not inventing another shop's rules/);
  });

  it("keeps a client's own scanRules verbatim while dropping workstationRoles", () => {
    const ownRules = [{ role: "press", from: "printed", to: "packed", notifyWhenEmpty: false }];
    const { profile, changed, applied } = migrateShopProfile({
      schemaVersion: 1,
      scanRules: ownRules,
      workstationRoles: ["press"],
    });

    expect(changed).toBe(true);
    expect(profile.scanRules).toEqual(ownRules);
    expect(profile.workstationRoles).toBeUndefined();
    expect(applied).not.toContain("add scanRules (4 frozen 2f rules)");
  });

  it("bumps a v1 row that already carries scanRules without touching them", () => {
    const rules = [{ role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: true }];
    const { profile, changed, skipped } = migrateShopProfile({ schemaVersion: 1, scanRules: rules });

    expect(changed).toBe(true);
    expect(profile.schemaVersion).toBe(2);
    expect(profile.scanRules).toEqual(rules);
    expect(skipped).toEqual([]);
  });
});

describe("migrateShopProfile - when nothing may be written", () => {
  it("is idempotent: a second pass over its own output changes nothing", () => {
    const once = migrateShopProfile(alexRow()).profile;
    const twice = migrateShopProfile(once);

    expect(twice.changed).toBe(false);
    expect(twice.applied).toEqual([]);
    expect(twice.profile).toEqual(once);
  });

  it("leaves a row that is already at the current version alone", () => {
    const row = { schemaVersion: PROFILE_SCHEMA_VERSION, scanRules: [] };
    const { changed, applied } = migrateShopProfile(row);
    expect(changed).toBe(false);
    expect(applied).toEqual([]);
  });

  // Z2: initDb seeds DEFAULT_PROFILE, so its version has to match the shape it has. If it
  // lagged, every fresh install would dump, back up and rewrite a row with nothing to fix.
  it("treats a freshly seeded DEFAULT_PROFILE row as already current", () => {
    const { changed, applied } = migrateShopProfile(structuredClone(DEFAULT_PROFILE));
    expect(changed).toBe(false);
    expect(applied).toEqual([]);
  });

  it("refuses a row written by a newer build", () => {
    const { profile, changed, skipped } = migrateShopProfile({ schemaVersion: 3, whatever: true });
    expect(changed).toBe(false);
    expect(profile).toEqual({ schemaVersion: 3, whatever: true });
    expect(skipped[0]).toMatch(/newer than this build/);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not a profile"],
    ["a number", 7],
    ["an array", [{ schemaVersion: 1 }]],
  ])("returns changed:false for %s", (_label, value) => {
    const { profile, changed, skipped } = migrateShopProfile(value);
    expect(changed).toBe(false);
    expect(profile).toBeNull();
    expect(skipped).toHaveLength(1);
  });

  it("treats a row with no schemaVersion as the oldest shape", () => {
    const { profile, changed } = migrateShopProfile({ workstationRoles: ["cotton"] });
    expect(changed).toBe(true);
    expect(profile.schemaVersion).toBe(2);
    expect(profile.scanRules).toHaveLength(4);
  });
});
