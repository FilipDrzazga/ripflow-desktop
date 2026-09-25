import { describe, it, expect } from "vitest";
import { migrateShopProfile, PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

// ETAP 2g-3a: v2 -> v3 - profile.materialClasses[] becomes the owner of the class numbers,
// taken from THIS shop's fabric_globals (passed in), never from DEFAULT_PROFILE.

// Alex's live row at v2, as measured on the 2026-09-24/25 backups (shape, not every key)
const v2Row = () => ({
  schemaVersion: 2,
  printers: [{ code: "DGEN", materialClass: "Cottons" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultXmlWidth: 1420, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultXmlWidth: 1420, defaultRollWidth: 1550 },
  ],
  scanRules: [{ role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false }],
});
// what fabric_globals holds at Alex (= the seed)
const ALEX_GLOBALS = {
  marginCotton: 10, marginPoly: 5, defaultXmlWidthCotton: 1420, defaultXmlWidthPoly: 1420,
  defaultRollWidthCotton: 1420, defaultRollWidthPoly: 1550,
};

describe("migrateShopProfile v2 -> v3 (class numbers into materialClasses)", () => {
  it("the build is at v3", () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(3);
  });

  it("Alex's row: v3, the same numbers, defaultXmlWidth dropped, everything else untouched", () => {
    const { profile, changed, blocked } = migrateShopProfile(v2Row(), { fabricGlobals: ALEX_GLOBALS });
    expect(changed).toBe(true);
    expect(blocked).toBeNull();
    expect(profile.schemaVersion).toBe(3);
    expect(profile.materialClasses).toEqual([
      { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
      { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
    ]);
    expect(profile.printers).toEqual(v2Row().printers);
    expect(profile.scanRules).toEqual(v2Row().scanRules);
  });

  it("the numbers come from fabric_globals, not from the row and not from DEFAULT_PROFILE", () => {
    const globals = { marginCotton: 12, marginPoly: 7, defaultRollWidthCotton: 1460, defaultRollWidthPoly: 1600 };
    const { profile, applied } = migrateShopProfile(v2Row(), { fabricGlobals: globals });
    expect(profile.materialClasses).toEqual([
      { name: "Cottons", margin: 12, defaultRollWidth: 1460 },
      { name: "Polyesters", margin: 7, defaultRollWidth: 1600 },
    ]);
    expect(applied).toContain("Cottons.margin = 12 (fabric_globals.marginCotton)");
  });

  it("unreadable fabric_globals (null) BLOCKS the step: the row stays v2, nothing to write", () => {
    const row = v2Row();
    const { profile, changed, blocked } = migrateShopProfile(row, { fabricGlobals: null });
    expect(changed).toBe(false);
    expect(blocked).toMatch(/fabric_globals could not be read/);
    expect(profile.schemaVersion).toBe(2);
    expect(profile.materialClasses[0].defaultXmlWidth).toBe(1420);
  });

  it("no context at all blocks it the same way - a caller that forgets the input migrates nothing", () => {
    const { changed, blocked } = migrateShopProfile(v2Row());
    expect(changed).toBe(false);
    expect(blocked).toMatch(/fabric_globals could not be read/);
  });

  it("a v1 row with unreadable fabric_globals still gets v2 (scanRules), and stops there", () => {
    const { profile, changed, blocked, applied } = migrateShopProfile(
      { schemaVersion: 1, workstationRoles: ["cotton"], materialClasses: [] },
      { fabricGlobals: null },
    );
    expect(changed).toBe(true);
    expect(profile.schemaVersion).toBe(2);
    expect(applied).toContain("set schemaVersion 1 -> 2");
    expect(applied).not.toContain("set schemaVersion 2 -> 3");
    expect(blocked).toMatch(/stays at v2/);
  });

  it("a v1 row with fabric_globals goes all the way to v3", () => {
    const { profile, applied } = migrateShopProfile(
      { schemaVersion: 1, workstationRoles: ["cotton"], materialClasses: v2Row().materialClasses },
      { fabricGlobals: ALEX_GLOBALS },
    );
    expect(profile.schemaVersion).toBe(3);
    expect(applied).toEqual(expect.arrayContaining(["set schemaVersion 1 -> 2", "set schemaVersion 2 -> 3"]));
  });

  it("a missing or non-numeric key leaves THAT number as it is, with a note", () => {
    const { profile, skipped } = migrateShopProfile(v2Row(), {
      fabricGlobals: { marginCotton: "abc", defaultRollWidthCotton: 1460, marginPoly: null },
    });
    expect(profile.materialClasses[0]).toEqual({ name: "Cottons", margin: 10, defaultRollWidth: 1460 });
    expect(profile.materialClasses[1]).toEqual({ name: "Polyesters", margin: 5, defaultRollWidth: 1550 });
    expect(skipped).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Cottons\.margin: fabric_globals\.marginCotton missing or not a number/),
        expect.stringMatching(/^Polyesters\.margin: fabric_globals\.marginPoly missing/),
        expect.stringMatching(/^Polyesters\.defaultRollWidth: fabric_globals\.defaultRollWidthPoly missing/),
      ]),
    );
  });

  it("a third class has no key in fabric_globals and keeps its numbers", () => {
    const row = v2Row();
    row.materialClasses.push({ name: "Linens", margin: 8, defaultRollWidth: 1500 });
    const { profile, skipped } = migrateShopProfile(row, { fabricGlobals: ALEX_GLOBALS });
    expect(profile.materialClasses[2]).toEqual({ name: "Linens", margin: 8, defaultRollWidth: 1500 });
    expect(skipped).toContain("Linens: no counterpart in fabric_globals - numbers left as they are");
  });

  it("no materialClasses: bumped to v3 with a note, nothing invented", () => {
    const { profile, skipped } = migrateShopProfile({ schemaVersion: 2, printers: [] }, { fabricGlobals: ALEX_GLOBALS });
    expect(profile.schemaVersion).toBe(3);
    expect(profile.materialClasses).toBeUndefined();
    expect(skipped).toContain("materialClasses missing - no class to move numbers into");
  });

  it("idempotent: a v3 row is left alone, and the input row is not mutated", () => {
    const row = v2Row();
    const once = migrateShopProfile(row, { fabricGlobals: ALEX_GLOBALS }).profile;
    expect(row.schemaVersion).toBe(2);
    expect(row.materialClasses[0].defaultXmlWidth).toBe(1420);
    const twice = migrateShopProfile(once, { fabricGlobals: { marginCotton: 99 } });
    expect(twice.changed).toBe(false);
    expect(twice.profile).toBe(once);
  });

  it("DEFAULT_PROFILE (the seed and the golden stub) already has the v3 shape", () => {
    expect(DEFAULT_PROFILE.schemaVersion).toBe(3);
    expect(DEFAULT_PROFILE.materialClasses.every((c) => !("defaultXmlWidth" in c))).toBe(true);
    expect(migrateShopProfile(structuredClone(DEFAULT_PROFILE), { fabricGlobals: ALEX_GLOBALS }).changed).toBe(false);
  });
});
