import { describe, it, expect, vi } from "vitest";
import { saveClassNumbers } from "./saveClassNumbers.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

// ETAP 4 (4-types-b part 2): saveClassNumbers takes the form BY CLASS NAME. The outcomes the
// removed four-key tests proved, re-proven for the new shape (the "profile cannot be read" case
// still lives in saveClassNumbers.test.js).

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
};
// the form holds strings (input values) - the save converts them
const FORM = { Cottons: { margin: "12", defaultRollWidth: "1400" }, Polyesters: { margin: "6", defaultRollWidth: "1600" } };

const deps = (over = {}) => ({
  getProfile: vi.fn(async () => ({ success: true, data: PROFILE })),
  setProfile: vi.fn(async () => ({ success: true })),
  ...over,
});

describe("saveClassNumbers - by class name", () => {
  it("writes the numbers, converted, into the profile and nothing else", async () => {
    const d = deps();
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "saved" });
    const written = d.setProfile.mock.calls[0][0];
    expect(written.materialClasses).toEqual([
      { name: "Cottons", margin: 12, defaultRollWidth: 1400 },
      { name: "Polyesters", margin: 6, defaultRollWidth: 1600 },
    ]);
    expect(written.printers).toEqual(PROFILE.printers);
  });

  it("a shop with renamed classes can save its numbers", async () => {
    const p = { materialClasses: [{ name: "Cotton", margin: 1, defaultRollWidth: 1 }, { name: "Poly", margin: 1, defaultRollWidth: 1 }] };
    const d = deps({ getProfile: async () => ({ success: true, data: p }) });
    const form = { Cotton: { margin: "11", defaultRollWidth: "1500" }, Poly: { margin: "4", defaultRollWidth: "1700" } };
    expect(await saveClassNumbers(form, d)).toEqual({ outcome: "saved" });
    expect(d.setProfile.mock.calls[0][0].materialClasses).toEqual([
      { name: "Cotton", margin: 11, defaultRollWidth: 1500 },
      { name: "Poly", margin: 4, defaultRollWidth: 1700 },
    ]);
  });

  it("writes nothing when the stored profile no longer lists a class of the form", async () => {
    const d = deps({ getProfile: async () => ({ success: true, data: { materialClasses: [{ name: "Cottons" }] } }) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "missing-class", error: "The shop profile has no class: Polyesters." });
    expect(d.setProfile).not.toHaveBeenCalled();
  });

  it("profile write failed -> profile-failed with its error", async () => {
    const d = deps({ setProfile: vi.fn(async () => ({ success: false, error: "SQLITE_BUSY" })) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-failed", error: "SQLITE_BUSY" });
  });

  it("profile write did not answer -> profile-failed with the timeout", async () => {
    const d = deps({ setProfile: vi.fn(async () => { throw new Error("profile:set timed out"); }) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-failed", error: "profile:set timed out" });
  });

  it("another station saved in between -> profile-changed, its own outcome (a Warning in the view)", async () => {
    const MESSAGE = "The shop profile was changed on another station after this one loaded it. Nothing was saved.";
    const d = deps({ setProfile: vi.fn(async () => ({ success: false, code: PROFILE_CHANGED, error: MESSAGE })) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-changed", error: MESSAGE });
  });
});
