import { describe, it, expect, vi } from "vitest";

// <RepeatType> and <Dpi> (FILIP 2026-10-21: in the general XML, for every job), rendered by the
// real buildPFJobXML from names parsed by the real parser. Same stubbing edge as
// createXML.etsyRoute.test.js.

vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:/root" }));
vi.mock("../helpers/fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
  getFabricByName: () => ({ isVelvet: 0, isLinen: 0, isBlossom: 0 }),
  getEstimateConfig: () => null,
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML } from "./createXML.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

const PROFILE = { productTypes: [{ code: "SAMPLE", width: 220, height: 200 }] };

const ON_PDF = "ON312819_Ann_Lee_1of3_Drill_3x_Linear Meter - 1m increments_XWD111484_FF.pdf";
const ET_PDF = "ET3456789012_Ann_Lee_2of3_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_ETSY.pdf";
const ET_TILE = "ET3456789012_Ann_Lee_3of3_Drill_2x_Linear Meter - 1m increments_XWD173706_Half-Drop_211.67_ETSY.jpg";
const ET_TILE_NO_DPI = "ET3456789012_Ann_Lee_3of3_Drill_2x_Linear Meter - 1m increments_XWD173706_Mirror_ETSY.tif";

const item = (name) => ({
  ...parsePrintFileName(name, { dir: "C:/in/Drill", fullPath: `C:/in/Drill/${name}`, shopConfig: PROFILE }),
  printGroup: "Drill",
  printer: "DGEN",
  materialType: "Cottons",
});

const BATCH = "21-10-2026/PRINTED_101010-Drill-DGEN";
const docs = (names) => buildPFJobXML(names.map(item), BATCH).split("<Document>").slice(1);
const field = (doc, tag) => doc.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1];

describe("<RepeatType> and <Dpi>", () => {
  it("a PDF is a finished print: None and an empty <Dpi>, ON and Etsy alike", () => {
    for (const doc of docs([ON_PDF, ET_PDF])) {
      expect(field(doc, "RepeatType")).toBe("None");
      expect(doc).toContain("<Dpi></Dpi>");
    }
  });

  it("an image carries the repeat type of its name and NEVER the DPI number of its name (P104)", () => {
    const [doc] = docs([ET_TILE]);
    expect(field(doc, "RepeatType")).toBe("Half-Drop");
    expect(doc).toContain("<Dpi></Dpi>");
    expect(doc).not.toContain("211.67</");
    expect(field(doc, "Path")).toBe("X:/root\\PRINTED\\21-10-2026\\PRINTED_101010-Drill-DGEN\\" + ET_TILE);
  });

  it("an image without a DPI in its name leaves <Dpi> empty too", () => {
    const [doc] = docs([ET_TILE_NO_DPI]);
    expect(field(doc, "RepeatType")).toBe("Mirror");
    expect(doc).toContain("<Dpi></Dpi>");
  });

  it("each document of a mixed batch gets its own values, both fields right after <IsBlossom>", () => {
    const all = docs([ON_PDF, ET_TILE]);
    expect(all.map((d) => field(d, "RepeatType"))).toEqual(["None", "Half-Drop"]);
    for (const d of all) expect(d).toMatch(/<\/IsBlossom>\s*<RepeatType>[^<]*<\/RepeatType>\s*<Dpi>[^<]*<\/Dpi>\s*<\/Document>/);
  });
});

describe("an image without a repeat type is refused at the source", () => {
  it("ERR_MISSING_REPEAT_TYPE, even when it reached the XML past the INVALID status", () => {
    const tileWithout = { ...item(ET_TILE), repeatType: null };
    expect(() => buildPFJobXML([item(ON_PDF), tileWithout], BATCH)).toThrow(
      expect.objectContaining({ code: "ERR_MISSING_REPEAT_TYPE", stage: "validate" }),
    );
  });

  it("a PDF with no repeat type is not refused - it never has one", () => {
    expect(() => buildPFJobXML([item(ON_PDF)], BATCH)).not.toThrow();
  });
});
