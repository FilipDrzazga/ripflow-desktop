import { describe, it, expect, vi } from "vitest";

// A snood and an apron (FILIP 2026-10-23) reach PrintFactory through the SAME document element as every other product:
// <PrintTypeCode> carries SNOOD / APRON, <Width> / <Height> the profile's size, <Copies> the quantity. The orientation
// ("upright, not rotate") is set in the PrintFactory workflow, not here. Same stubbing edge as createXML.etsyRoute.test.js.

vi.mock("../helpers/getRootPath.js", () => ({ getXmlRootPath: () => "X:/root" }));
vi.mock("../helpers/fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Polyesters",
  getFabricByName: () => ({ isVelvet: 0, isLinen: 0, isBlossom: 0 }),
  getEstimateConfig: () => null,
}));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({}) }));

import { buildPFJobXML } from "./createXML.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "SNOOD", width: 500, height: 700 },
    { code: "APRON", width: 500, height: 700 },
  ],
};

const item = (name) => ({
  ...parsePrintFileName(name, { dir: "C:/in/Active Eco Lycra", fullPath: `C:/in/Active Eco Lycra/${name}`, shopConfig: PROFILE }),
  printGroup: "Active Eco Lycra",
  printer: "YOKO",
  materialType: "Polyesters",
});

const documents = (names) => buildPFJobXML(names.map(item), "23-10-2026/PRINTED_090000-Active Eco Lycra-YOKO").split("<Document>").slice(1);

const SNOOD = "ET3456789012_Ann_Lee_1of2_Active Eco Lycra_2x_Snood_XWD111484_Basic_ETSY.jpg";
const APRON = "ET3456789012_Ann_Lee_2of2_Active Eco Lycra_1x_Apron_XWD111484_Basic_ETSY.jpg";

describe("a snood and an apron in the job XML", () => {
  const [snood, apron] = documents([SNOOD, APRON]);

  it("the print type code is the value of the existing <PrintTypeCode> element", () => {
    expect(snood).toContain("<PrintTypeCode>SNOOD</PrintTypeCode>");
    expect(apron).toContain("<PrintTypeCode>APRON</PrintTypeCode>");
  });

  it("the size is the profile's, the copies the quantity, the tile repeat is carried", () => {
    expect(snood).toContain("<Copies>2</Copies>");
    expect(snood).toContain("<Width>500</Width>");
    expect(snood).toContain("<Height>700</Height>");
    expect(apron).toContain("<Copies>1</Copies>");
    expect(snood).toContain("<RepeatType>Basic</RepeatType>");
  });

  it("there is no element of its own for them - the template is the one every other product uses", () => {
    expect(snood).not.toMatch(/<IsSnood>|<IsApron>/);
  });
});
