import { describe, it, expect } from "vitest";
import { getSewingCompanies } from "./shopProfileData";

// Minimal profile builder — only the key getSewingCompanies reads.
const withCompanies = (sewingCompanies) => ({ schemaVersion: 1, sewingCompanies });

describe("getSewingCompanies — sentinel (unreadable profile)", () => {
  it("returns an empty list when the profile is null", () => {
    expect(getSewingCompanies(null)).toEqual([]);
  });

  it("returns an empty list when the profile is undefined", () => {
    expect(getSewingCompanies(undefined)).toEqual([]);
  });
});

describe("getSewingCompanies — shape guard", () => {
  it("returns an empty list when the profile carries no sewingCompanies key", () => {
    expect(getSewingCompanies({ schemaVersion: 1 })).toEqual([]);
  });

  // The profile is a free-form JSON blob in one column, so a hand-edited or
  // half-imported row can put anything under this key. Nothing but an array is a list.
  it("returns an empty list for a non-array value", () => {
    expect(getSewingCompanies(withCompanies("Olya"))).toEqual([]);
    expect(getSewingCompanies(withCompanies({ 0: "Olya" }))).toEqual([]);
    expect(getSewingCompanies(withCompanies(42))).toEqual([]);
    expect(getSewingCompanies(withCompanies(null))).toEqual([]);
  });
});

describe("getSewingCompanies — element filtering", () => {
  it("drops non-string elements", () => {
    expect(getSewingCompanies(withCompanies([1, true, null, undefined, {}, ["x"]]))).toEqual([]);
  });

  it("drops empty and whitespace-only names", () => {
    expect(getSewingCompanies(withCompanies(["", "   ", "\t\n"]))).toEqual([]);
  });

  // The name reaches file_stages.sewing_company as free text and is shown on a card,
  // so a stray element must not become a blank, unclickable submenu entry.
  it("keeps only the usable names out of a mixed array", () => {
    expect(getSewingCompanies(withCompanies(["Olya", "", 7, null, "Vagabond", "  "])))
      .toEqual(["Olya", "Vagabond"]);
  });

  it("returns an empty list for an empty array", () => {
    expect(getSewingCompanies(withCompanies([]))).toEqual([]);
  });
});

describe("getSewingCompanies — trimming and passthrough", () => {
  it("trims surrounding whitespace off the names it keeps", () => {
    expect(getSewingCompanies(withCompanies(["  Olya ", "\tVagabond\n"])))
      .toEqual(["Olya", "Vagabond"]);
  });

  // Pins the helper to ONE key. Every other test builds its input through withCompanies,
  // so none of them would notice a tolerant read like
  // `profile.sewingCompanies ?? profile.companies` — and a second accepted key is how a
  // half-migrated profile starts dispatching to a list nobody edited.
  it("reads the sewingCompanies key, not a neighbouring one", () => {
    expect(getSewingCompanies({ sewing: ["Olya"], companies: ["Olya"] })).toEqual([]);
  });
});
