import { describe, it, expect } from "vitest";
import { isProfileUnconfigured } from "./shopProfileData.js";
import { DEFAULT_PROFILE } from "../../electron/helpers/defaultProfile.js";
import ALEX from "../../../profiles/fashion-formula-profile.json";

// ETAP 3-6: the "Shop profile not configured" banner. It is about a LOADED profile that gives the
// operator no printer - the fresh-install skeleton - and never about an unreadable one (that is
// the failure banner, shown from shopProfileStatus).

describe("isProfileUnconfigured", () => {
  it("the fresh-install skeleton is unconfigured", () => {
    expect(isProfileUnconfigured(DEFAULT_PROFILE)).toBe(true);
  });

  it("an imported profile with printers is configured", () => {
    expect(isProfileUnconfigured(ALEX)).toBe(false);
  });

  it("printers nobody can use count as none", () => {
    expect(isProfileUnconfigured({ printers: [{ code: "BAD-CODE", materialClass: "Cottons" }] })).toBe(true);
    expect(isProfileUnconfigured({ printers: "DGEN" })).toBe(true);
  });

  it("an unreadable profile is NOT this banner's case", () => {
    expect(isProfileUnconfigured(null)).toBe(false);
    expect(isProfileUnconfigured(undefined)).toBe(false);
  });
});
