import { describe, it, expect, vi } from "vitest";

// ETAP 4 (4-types-e, FILIP 2026-09-28 "Odmawia"): a product size the shop profile cannot give is
// a REFUSED file, never Alex's built-in dimensions. shopConfig null = the profile could not be
// read; a profile without a valid entry for the code = this shop does not configure that type.
// Both: width/height null, error UNKNOWN_PRODUCT_SIZE, status INVALID. The old fallback these
// cases used to take was pinned by 8 tests of parseFileNameShopConfig.test.js, removed with it.
// Same isolation as the neighbouring parser suites (fabricCache mocked).

vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Unknown",
}));

import { parsePrintFileName } from "./parseFileName.js";

const XWD = "XWD1a2b3c4d5e";
const NAMES = {
  SAMPLE: `ON312405_Hanna_Wilson_1of3_Stretch Jersey_1x_Sample Print - 20 x 20 cm_${XWD}_FF.pdf`,
  FQ: `ON311936_Diana_Smith_2of6_Palatine Velvet FR_1x_Fat Quarter - 65 x 48 cm_${XWD}_FF.pdf`,
  TEA_TOWEL: "ON312896_Karol_Lewis_1of2_Custom Tea Towel_Drill _ Fully Sewn_50_FF_2998.pdf",
};
const parse = (key, shopConfig) =>
  parsePrintFileName(NAMES[key], { dir: "C:\\inbox", fullPath: `C:\\inbox\\${NAMES[key]}`, shopConfig });

const withTypes = (productTypes) => ({ schemaVersion: 3, productTypes });

const expectRefused = (out, reason) => {
  expect(out.width).toBeNull();
  expect(out.height).toBeNull();
  expect(out.status).toBe("INVALID");
  const err = out.errors.find((e) => e.code === "UNKNOWN_PRODUCT_SIZE");
  expect(err?.message).toMatch(reason);
  // the refusal says why; the generic "could not be parsed" warning would only confuse
  expect(out.warnings).not.toContain("Size exists but width/height could not be parsed.");
};

describe("parsePrintFileName - a product size the profile cannot give is refused", () => {
  it("the profile could not be read (shopConfig null): every fixed-size type is refused", () => {
    for (const key of Object.keys(NAMES)) {
      expectRefused(parse(key, null), /the shop profile could not be read/);
    }
  });

  it("a profile without this type: refused, naming the type; the configured type still works", () => {
    const cfg = withTypes([{ code: "FQ", width: 333, height: 444 }]);
    expectRefused(parse("SAMPLE", cfg), /SAMPLE has no size in the shop profile/);
    expectRefused(parse("TEA_TOWEL", cfg), /TEA_TOWEL has no size in the shop profile/);
    const fq = parse("FQ", cfg);
    expect([fq.width, fq.height, fq.status]).toEqual([333, 444, "READY"]);
  });

  it("the fresh-install skeleton (no product types) refuses them all", () => {
    for (const key of Object.keys(NAMES)) expectRefused(parse(key, withTypes([])), /has no size in the shop profile/);
  });

  it("a malformed entry is not a size: missing productTypes, wrong key, other case, non-finite numbers", () => {
    const cases = [
      { schemaVersion: 3 },
      { schemaVersion: 3, productTypes: "FQ" },
      { schemaVersion: 3, types: [{ code: "FQ", width: 1, height: 2 }] },
      withTypes([{ code: "fq", width: 1, height: 2 }]),
      withTypes([{ code: " FQ", width: 1, height: 2 }]),
      withTypes([{ code: "FQ", width: "670", height: 480 }]),
      withTypes([{ code: "FQ", width: 670, height: NaN }]),
    ];
    for (const cfg of cases) expectRefused(parse("FQ", cfg), /FQ has no size in the shop profile/);
  });

  it("a non-object shopConfig counts as unreadable", () => {
    expectRefused(parse("FQ", "profile"), /the shop profile could not be read/);
  });

  it("LM is untouched: its width comes from the fabric catalogue, not the profile", () => {
    const lm = `ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`;
    const out = parsePrintFileName(lm, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${lm}`, shopConfig: null });
    expect(out.printTypeCode).toBe("LM");
    expect(out.width).toBe(1420);
    expect(out.errors.some((e) => e.code === "UNKNOWN_PRODUCT_SIZE")).toBe(false);
  });
});
