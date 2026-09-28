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

});
