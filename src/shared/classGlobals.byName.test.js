import { describe, it, expect } from "vitest";
import { withClassNumbersByName, classNumbersFromProfile } from "./classGlobals.js";

// ETAP 4 (4-types-b part 2): the editor's write, BY CLASS NAME. It replaced withClassNumbers and
// its four fixed keys; the same guarantees, re-proven for the new shape.

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN", materialClass: "Cottons" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
  features: { analytics: true },
};
const NEW = { Cottons: { margin: 12, defaultRollWidth: 1400 }, Polyesters: { margin: 6, defaultRollWidth: 1600 } };

describe("withClassNumbersByName", () => {
  it("writes each class's numbers into its own entry", () => {
    const { profile, missing } = withClassNumbersByName(PROFILE, NEW);
    expect(missing).toEqual([]);
    expect(profile.materialClasses).toEqual([
      { name: "Cottons", margin: 12, defaultRollWidth: 1400 },
      { name: "Polyesters", margin: 6, defaultRollWidth: 1600 },
    ]);
  });

  it("works for renamed classes", () => {
    const p = { materialClasses: [{ name: "Cotton", margin: 1, defaultRollWidth: 1 }] };
    expect(withClassNumbersByName(p, { Cotton: { margin: 9, defaultRollWidth: 1500 } }).profile.materialClasses).toEqual([
      { name: "Cotton", margin: 9, defaultRollWidth: 1500 },
    ]);
  });

  it("round-trips through classNumbersFromProfile", () => {
    expect(classNumbersFromProfile(withClassNumbersByName(PROFILE, NEW).profile)).toEqual(NEW);
  });

  it("leaves other classes, other fields and every other profile section untouched", () => {
    const p = { ...PROFILE, materialClasses: [...PROFILE.materialClasses, { name: "Linens", margin: 8, defaultRollWidth: 1500, note: "x" }] };
    const { profile } = withClassNumbersByName(p, { Cottons: NEW.Cottons });
    expect(profile.materialClasses[1]).toBe(p.materialClasses[1]);
    expect(profile.materialClasses[2]).toBe(p.materialClasses[2]);
    expect(profile.printers).toBe(PROFILE.printers);
    expect(profile.features).toBe(PROFILE.features);
    expect(profile.schemaVersion).toBe(3);
  });

  it("never mutates the input profile", () => {
    const input = structuredClone(PROFILE);
    withClassNumbersByName(input, NEW);
    expect(input).toEqual(PROFILE);
  });

  it("does not add a class the profile does not list - it reports it as missing", () => {
    const onlyCotton = { materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }] };
    const { profile, missing } = withClassNumbersByName(onlyCotton, NEW);
    expect(missing).toEqual(["Polyesters"]);
    expect(profile.materialClasses.map((c) => c.name)).toEqual(["Cottons"]);
  });

  it("reports every class missing when materialClasses is absent or not an array", () => {
    expect(withClassNumbersByName({}, NEW).missing).toEqual(["Cottons", "Polyesters"]);
    expect(withClassNumbersByName({ materialClasses: "x" }, NEW).missing).toEqual(["Cottons", "Polyesters"]);
  });
});
