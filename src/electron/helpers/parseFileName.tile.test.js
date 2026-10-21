import { describe, it, expect, vi } from "vitest";

// Etsy image tiles (FILIP 2026-10-21): the file is taken from the Etsy library as it lies, and
// its name carries the repeat type and the DPI right after the XWD token. Same isolation as the
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

// What the rest of the app reads apart from the two tile fields and the name itself.
const NOT_ROUTE = ["detectedAt", "file", "tokens", "repeatType", "dpi"];
const route = (out) => Object.fromEntries(Object.entries(out).filter(([k]) => !NOT_ROUTE.includes(k)));

describe("an image tile name", () => {
  it("parses READY with the repeat type and the DPI from the name", () => {
    const out = parse(tile("Half-Drop_211.67_ETSY.jpg"));
    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.repeatType).toBe("Half-Drop");
    expect(out.dpi).toBe(211.67);
    expect(out.file.ext).toBe("jpg");
  });

  it("is the same job as the PDF of the same name, bar the two tile fields", () => {
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

  it("no DPI = READY with a warning, the RIP uses the image's own", () => {
    for (const tail of ["Basic_ETSY.jpg", "Basic_abc_ETSY.jpg", "Basic_0_ETSY.jpg"]) {
      const out = parse(tile(tail));
      expect(out.status).toBe("READY");
      expect(out.dpi).toBeNull();
      expect(out.warnings).toEqual(["No DPI after the repeat type - the RIP uses the resolution stored in the image."]);
    }
  });
});

describe("a PDF is a finished print", () => {
  it("keeps both tile fields null", () => {
    const out = parse(PDF);
    expect(out.repeatType).toBeNull();
    expect(out.dpi).toBeNull();
  });

  it("even with a repeat word and a number after the XWD token", () => {
    const out = parse(tile("Basic_150_ETSY.pdf"));
    expect(out.repeatType).toBeNull();
    expect(out.dpi).toBeNull();
    expect(out.errors).toEqual([]);
  });

  it("an ON file stays as it was", () => {
    const out = parse("ON312819_Ann_Lee_1of2_Drill_3x_Linear Meter - 1m increments_XWD111484_FF.pdf");
    expect(out.status).toBe("READY");
    expect(out.repeatType).toBeNull();
    expect(out.dpi).toBeNull();
  });
});
