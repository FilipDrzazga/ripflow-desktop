import { describe, it, expect } from "vitest";
import { CLASS_NUMBER_KEYS, classGlobalsFromProfile, withClassNumbers } from "./classGlobals.js";

// ETAP 2g-3c: the Settings editor writes the class numbers back into profile.materialClasses.
// withClassNumbers is the inverse of classGlobalsFromProfile and must touch nothing else.

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN", materialClass: "Cottons", hotfolder: "HF" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420, note: "kept" },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
    { name: "Silks", margin: 7 },
  ],
  folders: { ripError: "RIP_ERRORS" },
};
const NEW = { marginCotton: 12, defaultRollWidthCotton: 1400, marginPoly: 6, defaultRollWidthPoly: 1600 };

describe("CLASS_NUMBER_KEYS", () => {
  it("lists the four keys the estimator reads", () => {
    expect([...CLASS_NUMBER_KEYS].sort()).toEqual(
      ["defaultRollWidthCotton", "defaultRollWidthPoly", "marginCotton", "marginPoly"],
    );
  });
});

describe("withClassNumbers", () => {
  it("writes the four numbers into the Cottons and Polyesters entries", () => {
    const { profile, missing } = withClassNumbers(PROFILE, NEW);
    expect(missing).toEqual([]);
    expect(profile.materialClasses[0]).toEqual({ name: "Cottons", margin: 12, defaultRollWidth: 1400, note: "kept" });
    expect(profile.materialClasses[1]).toEqual({ name: "Polyesters", margin: 6, defaultRollWidth: 1600 });
  });

  it("round-trips through classGlobalsFromProfile", () => {
    expect(classGlobalsFromProfile(withClassNumbers(PROFILE, NEW).profile)).toEqual(NEW);
  });

  it("leaves other classes and every other profile section untouched", () => {
    const { profile } = withClassNumbers(PROFILE, NEW);
    expect(profile.materialClasses[2]).toBe(PROFILE.materialClasses[2]);
    expect(profile.printers).toBe(PROFILE.printers);
    expect(profile.folders).toBe(PROFILE.folders);
    expect(profile.schemaVersion).toBe(3);
    expect(profile.materialClasses).toHaveLength(3);
  });

  it("never mutates the input profile", () => {
    // Its own fixture, not PROFILE: under a mutating implementation the tests above would
    // already have written NEW into PROFILE, and a second write would change nothing.
    const input = {
      materialClasses: [
        { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
        { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
      ],
    };
    const before = JSON.stringify(input);
    withClassNumbers(input, NEW);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("does not add a class the profile does not list - it reports it as missing", () => {
    const onlyCotton = { materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }] };
    const { profile, missing } = withClassNumbers(onlyCotton, NEW);
    expect(missing).toEqual(["Polyesters"]);
    expect(profile.materialClasses.map((c) => c.name)).toEqual(["Cottons"]);
  });

  it("reports both classes missing when materialClasses is absent or not an array", () => {
    expect(withClassNumbers({}, NEW).missing).toEqual(["Cottons", "Polyesters"]);
    expect(withClassNumbers({ materialClasses: "x" }, NEW).missing).toEqual(["Cottons", "Polyesters"]);
  });
});
