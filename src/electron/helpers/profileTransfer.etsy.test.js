import { describe, it, expect, vi } from "vitest";
// db.js is the edge profileTransfer.test.js replaces too (its import chain reaches electron-store).
vi.mock("./db.js", () => ({}));

import { diffProfiles } from "./profileTransfer.js";

// E3b-1: the import preview reads flags by key, so the optional etsy flag shows up like any other.

const base = (features) => ({ printers: [], scanRules: [], sewingCompanies: [], features });
const OFF = { customOrders: false, analytics: false };

describe("diffProfiles - features.etsy", () => {
  it("a stored profile without etsy and a file with etsy true: turned on", () => {
    const d = diffProfiles(base(OFF), base({ ...OFF, etsy: true }));
    expect(d.featuresTurnedOn).toEqual(["etsy"]);
    expect(d.featuresTurnedOff).toEqual([]);
  });

  it("a stored etsy true and a file that omits the flag: turned off (the file says nothing = off)", () => {
    const d = diffProfiles(base({ ...OFF, etsy: true }), base(OFF));
    expect(d.featuresTurnedOff).toEqual(["etsy"]);
    expect(d.featuresTurnedOn).toEqual([]);
  });

  it("etsy absent on both sides, or false against absent: no change", () => {
    expect(diffProfiles(base(OFF), base(OFF)).featuresTurnedOn).toEqual([]);
    const d = diffProfiles(base(OFF), base({ ...OFF, etsy: false }));
    expect([d.featuresTurnedOn, d.featuresTurnedOff]).toEqual([[], []]);
  });
});
