import { describe, it, expect, vi } from "vitest";

// "The same route as an ON file" (FILIP 2026-10-21), measured at the end of that route: an Etsy
// file and its ON twin, parsed by the real parser and rendered by the real buildPFJobXML, give
// the same XML except where the file NAME and the order number (<OrderId>) are written. The
// catalogue is a constant (same stubbing edge as createXML.lengthExtra.test.js).

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

const PROFILE = {
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
  ],
};

const ON = [
  "ON312819_Ann_Lee_1of3_Drill_3x_Linear Meter - 1m increments_XWD111484_FF.pdf",
  "ON312819_Ann_Lee_2of3_Drill_2x_Fat Quarter - 65 x 48 cm_XWD111484_FF.pdf",
  "ON312819_Ann_Lee_3of3_Drill_1x_Sample Print - 20 x 20 cm_XWD111484_FF.pdf",
];
const toEtsy = (name) => name.replace(/^ON312819_/, "ET3456789012_").replace(/_FF\.pdf$/, "_ETSY.pdf");

const item = (name) => ({
  ...parsePrintFileName(name, { dir: "C:/in/Drill", fullPath: `C:/in/Drill/${name}`, shopConfig: PROFILE }),
  printGroup: "Drill",
  printer: "DGEN",
  materialType: "Cottons",
});

// The nesting UUID is random per render; masked exactly like the golden net masks it.
const xml = (names) =>
  buildPFJobXML(names.map(item), "21-10-2026/PRINTED_101010-Drill-DGEN").replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    "<uuid>",
  );

describe("an Etsy batch renders like its ON twin", () => {
  it("every byte matches once the file names and the order number are swapped back", () => {
    const on = xml(ON);
    const et = xml(ON.map(toEtsy));
    expect(et).not.toBe(on); // the names really are in the XML - otherwise the swap below proves nothing
    const stem = (name) => name.replace(/\.pdf$/, "");
    const back = ON.reduce((s, name) => s.split(stem(toEtsy(name))).join(stem(name)), et)
      .split("<OrderId>ET3456789012</OrderId>")
      .join("<OrderId>ON312819</OrderId>");
    expect(back).toBe(on);
  });

  it("the Etsy names and the Etsy order number reach the XML in full", () => {
    const et = xml(ON.map(toEtsy));
    for (const name of ON.map(toEtsy)) expect(et).toContain(name.replace(/\.pdf$/, ""));
    expect(et.match(/<OrderId>ET3456789012<\/OrderId>/g)).toHaveLength(3);
  });
});
