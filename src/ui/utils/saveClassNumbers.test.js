import { describe, it, expect, vi } from "vitest";
import { saveClassNumbers } from "./saveClassNumbers.js";

// ETAP 2g-3c: the class numbers go to the shop profile. The pilot's second write to fabric_globals
// went in 1.0.26 (every station on 1.0.25); setLegacyGlobals stays in deps as a spy only, so each
// case can still assert that nothing reaches fabric_globals any more.

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN" }],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
};
// the form holds strings (input values) - the save converts them
const FORM = { marginCotton: "12", defaultRollWidthCotton: "1400", marginPoly: "6", defaultRollWidthPoly: "1600" };

const deps = (over = {}) => ({
  getProfile: vi.fn(async () => ({ success: true, data: PROFILE })),
  setProfile: vi.fn(async () => ({ success: true })),
  setLegacyGlobals: vi.fn(async () => ({ success: true })),
  ...over,
});

describe("saveClassNumbers", () => {
  it("writes the profile and nothing else - fabric_globals is not written any more", async () => {
    const d = deps();
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "saved" });
    const written = d.setProfile.mock.calls[0][0];
    expect(written.materialClasses).toEqual([
      { name: "Cottons", margin: 12, defaultRollWidth: 1400 },
      { name: "Polyesters", margin: 6, defaultRollWidth: 1600 },
    ]);
    expect(written.printers).toEqual(PROFILE.printers);
    expect(d.setLegacyGlobals).not.toHaveBeenCalled();
  });

  it("writes nothing when the profile cannot be read (null data, failure, rejection)", async () => {
    for (const getProfile of [
      async () => ({ success: true, data: null }),
      async () => ({ success: false }),
      async () => { throw new Error("timeout"); },
    ]) {
      const d = deps({ getProfile });
      const res = await saveClassNumbers(FORM, d);
      expect(res.outcome).toBe("no-profile");
      expect(d.setProfile).not.toHaveBeenCalled();
      expect(d.setLegacyGlobals).not.toHaveBeenCalled();
    }
  });

  it("writes nothing when the profile lacks one of the two classes", async () => {
    const d = deps({
      getProfile: async () => ({ success: true, data: { materialClasses: [{ name: "Cottons" }] } }),
    });
    const res = await saveClassNumbers(FORM, d);
    expect(res).toEqual({ outcome: "missing-class", error: "The shop profile has no class: Polyesters." });
    expect(d.setProfile).not.toHaveBeenCalled();
    expect(d.setLegacyGlobals).not.toHaveBeenCalled();
  });

  it("does not touch fabric_globals when the profile write fails", async () => {
    const d = deps({ setProfile: vi.fn(async () => ({ success: false, error: "SQLITE_BUSY" })) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-failed", error: "SQLITE_BUSY" });
    expect(d.setLegacyGlobals).not.toHaveBeenCalled();
  });

  it("does not touch fabric_globals when the profile write does not answer", async () => {
    const d = deps({ setProfile: vi.fn(async () => { throw new Error("profile:set timed out"); }) });
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-failed", error: "profile:set timed out" });
    expect(d.setLegacyGlobals).not.toHaveBeenCalled();
  });
});
