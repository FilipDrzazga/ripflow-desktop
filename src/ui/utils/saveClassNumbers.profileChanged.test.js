import { describe, it, expect, vi } from "vitest";
import { saveClassNumbers } from "./saveClassNumbers.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

// ETAP 3-1: profile:set refuses with PROFILE_CHANGED when another station saved the profile after
// this one loaded it. That is its own outcome - FabricsView shows it as a Warning, apart from a
// failed save (rule 18's "rejected" vs "failed") - and nothing else is written.

const PROFILE = {
  schemaVersion: 3,
  materialClasses: [
    { name: "Cottons", margin: 10, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultRollWidth: 1550 },
  ],
};
const FORM = { marginCotton: "12", defaultRollWidthCotton: "1400", marginPoly: "6", defaultRollWidthPoly: "1600" };
const MESSAGE = "The shop profile was changed on another station after this one loaded it. Nothing was saved.";

describe("saveClassNumbers - profile changed on another station", () => {
  it("reports profile-changed and does not touch fabric_globals", async () => {
    const d = {
      getProfile: vi.fn(async () => ({ success: true, data: PROFILE })),
      setProfile: vi.fn(async () => ({ success: false, code: PROFILE_CHANGED, error: MESSAGE })),
      setLegacyGlobals: vi.fn(async () => ({ success: true })),
    };
    expect(await saveClassNumbers(FORM, d)).toEqual({ outcome: "profile-changed", error: MESSAGE });
    expect(d.setLegacyGlobals).not.toHaveBeenCalled();
  });
});
