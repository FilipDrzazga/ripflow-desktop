import { describe, it, expect, vi } from "vitest";

// A snood and an apron (FILIP 2026-10-23): products of the Etsy shop with their own print type code and their own branch
// in the PrintFactory workflow. Fixed size, read from the shop profile like FQ / SAMPLE - never from the name. Same
// isolation as the other parser suites.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";

const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "SNOOD", width: 500, height: 700 },
    { code: "APRON", width: 450, height: 800 },
  ],
};

const parse = (name, shopConfig = PROFILE) => parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}`, shopConfig });
const tile = (type, tail = "Basic_ETSY.jpg") => `ET3456789012_Ann_Lee_1of1_Active Eco Lycra_2x_${type}_XWD111484_${tail}`;

describe("a snood tile", () => {
  const out = parse(tile("Snood"));

  it("reads as SNOOD, READY, with the profile's size and its own quantity", () => {
    expect(out.errors).toEqual([]);
    expect(out).toMatchObject({ status: "READY", printTypeCode: "SNOOD", printType: "Snood", qty: 2, width: 500, height: 700, source: "ETSY" });
    expect(out.material).toBe("Active Eco Lycra");
    expect(out.repeatType).toBe("Basic");
  });

  it("takes the size from the profile, not from a size in the name", () => {
    const named = parse(tile("Snood 20 x 20 cm"));
    expect(named).toMatchObject({ printTypeCode: "SNOOD", width: 500, height: 700 });
  });

  it("is found in any case", () => {
    expect(parse(tile("ADULT SNOOD")).printTypeCode).toBe("SNOOD");
  });
});

describe("an apron tile", () => {
  it("reads as APRON, READY, with the apron's own profile size", () => {
    const out = parse(tile("Apron"));
    expect(out.errors).toEqual([]);
    expect(out).toMatchObject({ status: "READY", printTypeCode: "APRON", printType: "Apron", width: 450, height: 800 });
  });
});

describe("a profile that does not list the type", () => {
  it.each([
    ["Snood", "SNOOD"],
    ["Apron", "APRON"],
  ])("refuses a %s: INVALID, no size, UNKNOWN_PRODUCT_SIZE naming the code", (type, code) => {
    const shop = { productTypes: PROFILE.productTypes.filter((t) => t.code !== code) };
    const out = parse(tile(type), shop);
    expect(out.status).toBe("INVALID");
    expect(out.width).toBeNull();
    expect(out.height).toBeNull();
    expect(out.errors.find((e) => e.code === "UNKNOWN_PRODUCT_SIZE")?.message).toContain(code);
  });

  it("an unreadable profile (null) refuses it too", () => {
    const out = parse(tile("Snood"), null);
    expect(out.status).toBe("INVALID");
    expect(out.errors.some((e) => e.code === "UNKNOWN_PRODUCT_SIZE")).toBe(true);
  });

  it("a row with a non-numeric size does not put NaN into the job", () => {
    const out = parse(tile("Snood"), { productTypes: [{ code: "SNOOD", width: "500", height: 700 }] });
    expect(out.status).toBe("INVALID");
    expect(out.width).toBeNull();
  });
});

describe("the other types are untouched", () => {
  it("a Linear Meter and a Fat Quarter read as before", () => {
    expect(parse("ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD111484_Basic_ETSY.jpg")).toMatchObject({ printTypeCode: "LM" });
    expect(parse("ET3456789012_Ann_Lee_1of1_Drill_1x_Fat Quarter 65 x 48 cm_XWD111484_Basic_ETSY.jpg")).toMatchObject({ printTypeCode: "FQ", width: 670, height: 480 });
  });
});
