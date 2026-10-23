import { describe, it, expect, vi } from "vitest";

// S2 review 11:03, W1 and W3. SNOOD and APRON are products of the Etsy shop only (FILIP 2026-10-23 "Tylko Etsy"): the
// words name a type only in the name of an Etsy order, so a Shopify order or a hand-named file that merely mentions an
// apron reads as before the two types existed. And a parser called with no options at all never throws for them.
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
    { code: "APRON", width: 500, height: 700 },
  ],
};
const parse = (name, options = { shopConfig: PROFILE }) => parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}`, ...options });

describe("the words snood and apron outside an Etsy order", () => {
  it.each([
    ["a Shopify PDF", "ON1234_Jane Doe_1of1_Cotton Poplin_1x_Apron Strings Print_XWD111484_FF.pdf"],
    ["a Shopify PDF with the word snood", "ON1234_Jane Doe_1of1_Cotton Poplin_1x_Snood Pattern_XWD111484_FF.pdf"],
    ["a hand-named file with no order number", "Jane_Doe_1of1_Cotton Poplin_1x_Apron_XWD111484_FF.pdf"],
  ])("%s is not a snood or an apron - as before the types existed (MISSING_PRINT_TYPE)", (_label, name) => {
    const out = parse(name);
    expect(out.printTypeCode).toBe("UNKNOWN");
    expect(out.status).toBe("INVALID");
    expect(out.errors.map((e) => e.code)).toContain("MISSING_PRINT_TYPE");
    expect(out.width).toBeNull();
  });

  it("a Shopify Linear Meter that mentions an apron is still a Linear Meter", () => {
    const out = parse("ON1234_Jane Doe_1of1_Cotton Poplin_1x_Linear Meter - Apron_XWD111484_FF.pdf");
    expect(out).toMatchObject({ printTypeCode: "LM", status: "READY" });
  });

  it("the same word in an Etsy order IS the type", () => {
    expect(parse("ET3456789012_Jane_1of1_Active Eco Lycra_2x_Snood_XWD111484_Basic_ETSY.jpg")).toMatchObject({ printTypeCode: "SNOOD", status: "READY", width: 500, height: 700 });
    expect(parse("ET3456789012_Jane_1of1_Active Eco Lycra_1x_Apron_XWD111484_Basic_ETSY.jpg")).toMatchObject({ printTypeCode: "APRON", status: "READY" });
  });

  it("an unrecognised-kind name (no XWD token) with the word is not typed from a customer's name either", () => {
    const out = parse("ON1234_Mr Apron_1of1_Cotton Poplin_1x_Something.pdf");
    expect(out.printTypeCode).toBe("UNKNOWN");
  });
});

describe("a parser called with no options at all", () => {
  it.each([
    ["Snood", "ET3456789012_Jane_1of1_Active Eco Lycra_2x_Snood_XWD111484_Basic_ETSY.jpg"],
    ["Apron", "ET3456789012_Jane_1of1_Active Eco Lycra_1x_Apron_XWD111484_Basic_ETSY.jpg"],
  ])("does not throw for an Etsy %s: the file is INVALID, no size, UNKNOWN_PRODUCT_SIZE", (_label, name) => {
    const out = parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}` });
    expect(out.status).toBe("INVALID");
    expect(out.width).toBeNull();
    expect(out.height).toBeNull();
    expect(out.errors.some((e) => e.code === "UNKNOWN_PRODUCT_SIZE")).toBe(true);
  });

  it("the built-in sizes still answer SAMPLE and FQ with no options (the characterization tests)", () => {
    const out = parsePrintFileName("ON1234_Jane_1of1_Cotton Poplin_1x_Sample Print - 20 x 20 cm_XWD111484_FF.pdf");
    expect(out).toMatchObject({ printTypeCode: "SAMPLE", width: 220, height: 200 });
  });
});
