import { describe, it, expect, vi } from "vitest";

// Etsy file names (FILIP 2026-10-21): ET<receipt id>_..._XWD<id>_ETSY.pdf, otherwise the same
// layout as an ON file, so the file travels the same route. Same isolation as the other parser
// suites: the parser reads the catalogue through ./fabricCache.js only.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";

const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
  ],
};

const parse = (name) => parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}`, shopConfig: PROFILE });

// One ON file and its Etsy twin per XWD print type. Only the order number and the closing
// marker differ, which is the whole contract of the Etsy name.
const TWINS = {
  LM: [
    "ON312819_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_FF.pdf",
    "ET3456789012_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_ETSY.pdf",
  ],
  FQ: [
    "ON311936_Ann_Lee_2of2_Drill_2x_Fat Quarter - 65 x 48 cm_XWD111484_FF.pdf",
    "ET3456789012_Ann_Lee_2of2_Drill_2x_Fat Quarter - 65 x 48 cm_XWD111484_ETSY.pdf",
  ],
  SAMPLE: [
    "ON312405_Ann_Lee_1of1_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_FF.pdf",
    "ET3456789012_Ann_Lee_1of1_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_ETSY.pdf",
  ],
};

// The fields everything after the inbox reads; detectedAt is a clock and file/tokens are
// the name itself.
const NOT_ROUTE = ["detectedAt", "file", "tokens", "orderId", "source", "ff"];
const route = (out) => Object.fromEntries(Object.entries(out).filter(([k]) => !NOT_ROUTE.includes(k)));

describe("an Etsy file name parses like its ON twin", () => {
  it.each(Object.keys(TWINS))("%s: READY, same sizes, quantities and warnings as the ON file", (type) => {
    const [on, et] = TWINS[type].map(parse);
    expect(et.status).toBe("READY");
    expect(et.errors).toEqual([]);
    expect(route(et)).toEqual(route(on));
    expect(et.printTypeCode).toBe(type);
  });

  it("the order number is ET<receipt id> and the source is ETSY", () => {
    const et = parse(TWINS.LM[1]);
    expect(et.orderId).toBe("ET3456789012");
    expect(et.source).toBe("ETSY");
    expect(et.customerName).toBe("Ann Lee");
    expect(et.artworkId).toBe("XWD111484");
  });

  it("an Etsy file closed by ETSY carries no FF warning", () => {
    expect(parse(TWINS.FQ[1]).warnings).toEqual([]);
  });
});

describe("the ON files are untouched", () => {
  it("an ON file is SHOPIFY, keeps ff, and no new warning", () => {
    const on = parse(TWINS.LM[0]);
    expect(on.source).toBe("SHOPIFY");
    expect(on.ff).toBe(true);
    expect(on.warnings).toEqual([]);
  });

  it("an ON file without FF warns exactly as before", () => {
    const on = parse("ON312405_Ann_Lee_1of1_Drill_1x_Sample Print - 20 x 20 cm_XWD111484.pdf");
    expect(on.warnings).toEqual(["FF token not found (expected 'FF')", "FF token missing (treated as warning)."]);
    expect(on.status).toBe("READY");
  });

  it("a name with no order number has no source and still names both prefixes", () => {
    const out = parse("Ann_Lee_1of1_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_FF.pdf");
    expect(out.source).toBeNull();
    expect(out.errors.map((e) => e.code)).toContain("MISSING_ORDER_ID");
    expect(out.errors.find((e) => e.code === "MISSING_ORDER_ID").message).toBe("OrderId not found (expected ON123456 or ET123456).");
  });
});

describe("a marker that does not match the order", () => {
  it("an Etsy order closed by FF warns that ETSY is missing (still READY)", () => {
    const out = parse("ET3456789012_Ann_Lee_1of1_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_FF.pdf");
    expect(out.source).toBe("ETSY");
    expect(out.warnings).toEqual(["ETSY token not found (expected 'ETSY')", "ETSY token missing (treated as warning)."]);
    expect(out.status).toBe("READY");
  });
});
