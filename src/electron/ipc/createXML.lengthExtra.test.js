import { describe, it, expect, vi } from "vitest";

// The XML <Height> of a fabric with a length allowance: the file is printed that much longer, for every
// print type. Same stubbing edge as materialClassGate.test.js (everything outside buildPFJobXML is a
// constant); here the catalogue answers an allowance per fabric name.

vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:/root" }));
vi.mock("../helpers/fabricCache.js", () => ({
  getFabricByName: (name) =>
    ({
      Satin: { isVelvet: 0, isLinen: 0, isBlossom: 0, lengthExtraPercent: 5 },
      Chiffon: { isVelvet: 0, isLinen: 0, isBlossom: 0, lengthExtraPercent: 0 },
      Plain: { isVelvet: 0, isLinen: 0, isBlossom: 0 },
    })[name] ?? null,
  getEstimateConfig: () => null,
}));
vi.mock("../../shared/estimatePrintLength.js", () => ({
  estimatePrintLength: () => ({ fixedTotalLengthM: 12 }),
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML } from "./createXML.js";

const item = (over = {}) => ({
  file: { name: "ON1_Ann_Lee_1of1_Satin_1x_Linear Meter_XWDab12_FF.pdf", fullPath: "C:/in/a.pdf" },
  printGroup: "Satin",
  printer: "DGEN",
  material: "Satin",
  materialType: "Polyesters",
  printTypeCode: "LM",
  qty: 1,
  artworkId: "XWDab12",
  orderId: "ON1",
  width: 1420,
  height: 3000,
  ...over,
});

const heights = (batch) => [...buildPFJobXML(batch, "01-01-2026/PRINTED_101010-Satin-DGEN").matchAll(/<Height>([^<]*)<\/Height>/g)].map((m) => m[1]);

describe("buildPFJobXML - the length allowance in <Height>", () => {
  it("a fabric with an allowance is written longer", () => {
    expect(heights([item()])).toEqual(["3150"]);
  });

  it("every print type of that fabric, a fixed-size product included", () => {
    expect(heights([item({ printTypeCode: "CUSHION", width: 400, height: 400, qty: 2 })])).toEqual(["420"]);
  });

  it("a fabric with 0, with none set, or outside the catalogue is written at its height", () => {
    expect(heights([item({ material: "Chiffon" }), item({ material: "Plain" }), item({ material: "Nowhere" })])).toEqual(["3000", "3000", "3000"]);
  });

  it("only the fabric with the allowance changes in a mixed batch", () => {
    expect(heights([item(), item({ material: "Chiffon" })])).toEqual(["3150", "3000"]);
  });

  it("a height given as a string is stretched the same way", () => {
    expect(heights([item({ height: "2000" })])).toEqual(["2100"]);
  });
});
