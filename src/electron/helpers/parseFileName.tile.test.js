import { describe, it, expect, vi } from "vitest";

// Etsy image tiles (FILIP 2026-10-21): the file is taken from the Etsy library as it lies, and
// its name carries the repeat type right after the XWD token, then the library's DPI number,
// which is not read (P104: the RIP uses the DPI stored in the image). Same isolation as the
// other parser suites: the parser reads the catalogue through ./fabricCache.js only.
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

const PDF = "ET3456789012_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_ETSY.pdf";
const tile = (tail) => `ET3456789012_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_${tail}`;

// What the rest of the app reads apart from the tile field and the name itself.
const NOT_ROUTE = ["detectedAt", "file", "tokens", "repeatType"];
const route = (out) => Object.fromEntries(Object.entries(out).filter(([k]) => !NOT_ROUTE.includes(k)));

describe("an image tile name", () => {
  it("parses READY with the repeat type from the name", () => {
    const out = parse(tile("Half-Drop_211.67_ETSY.jpg"));
    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.repeatType).toBe("Half-Drop");
    expect(out.file.ext).toBe("jpg");
  });

  it("is the same job as the PDF of the same name, bar the tile field", () => {
    expect(route(parse(tile("Basic_150_ETSY.tif")))).toEqual(route(parse(PDF)));
  });

  it.each(["jpg", "JPEG", "png", "tif", "TIFF", "gif", "webp"])("the closing ETSY marker is found behind .%s", (ext) => {
    const out = parse(tile(`Basic_150_ETSY.${ext}`));
    expect(out.warnings).toEqual([]);
    expect(out.status).toBe("READY");
  });

  it("the repeat type is read in any case and given in the library spelling", () => {
    expect(parse(tile("half-brick_300_ETSY.png")).repeatType).toBe("Half-Brick");
  });

  it("no repeat type = INVALID, MISSING_REPEAT_TYPE", () => {
    const out = parse(tile("ETSY.jpg"));
    expect(out.status).toBe("INVALID");
    expect(out.errors.map((e) => e.code)).toEqual(["MISSING_REPEAT_TYPE"]);
    expect(out.repeatType).toBeNull();
  });

  it("a repeat word BEFORE the XWD token does not count", () => {
    const out = parse("ET3456789012_Ann_Basic_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_ETSY.jpg");
    expect(out.errors.map((e) => e.code)).toContain("MISSING_REPEAT_TYPE");
  });

  it("the DPI number of the name is not read: no dpi field, and no warning without it (P104)", () => {
    for (const tail of ["Basic_150_ETSY.jpg", "Basic_ETSY.jpg", "Basic_abc_ETSY.jpg"]) {
      const out = parse(tile(tail));
      expect(out.status).toBe("READY");
      expect(out.warnings).toEqual([]);
      expect(out).not.toHaveProperty("dpi");
    }
  });
});

describe("a PDF is a finished print", () => {
  it("keeps the tile field null", () => {
    expect(parse(PDF).repeatType).toBeNull();
  });

  it("even with a repeat word and a number after the XWD token", () => {
    const out = parse(tile("Basic_150_ETSY.pdf"));
    expect(out.repeatType).toBeNull();
    expect(out.errors).toEqual([]);
  });

  it("an ON file stays as it was", () => {
    const out = parse("ON312819_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_FF.pdf");
    expect(out.status).toBe("READY");
    expect(out.repeatType).toBeNull();
  });
});
