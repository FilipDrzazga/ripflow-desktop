import { describe, it, expect } from "vitest";
import { estimatePrintLength } from "./estimatePrintLength.js";

// ETAP 2g-2: the DEGRADED path of getRollWidth (no config = the fabric catalogue could not be
// read). The golden net never runs it - its stub always feeds a full catalogue (hole (a)) - so
// this file is the only evidence of what that path does.
//
// Since 2g-2 the degraded path gives every cotton the CLASS roll width (1420) and every
// polyester LM_ROLL_POLY (1550): the per-fabric map LM_ROLL_COTTON, keyed by Alex's fabric
// names, is gone. Before, four of its 33 entries differed from the class width: Hector Linen
// 1460, Organic Blossom Muslin Gauze 1270, Organic Stratos Linen 1370, Organic Nimbus Linen 1370.
//
// A roll width is observed through packing: two items side by side fit in ONE row only when
// their widths add up to at most the roll width. 2 x 720 = 1440 tells 1420 from 1460;
// 2 x 700 = 1400 tells 1420 from 1270 and from 1370.

const lm = (material, width, materialType = "Cottons") => ({
  printTypeCode: "LM",
  materialType,
  material,
  width,
  height: 500,
  qty: 1,
  variant: null,
});
const rows = (files, config) => estimatePrintLength(files, config).rowsCount;
const pair = (material, width, materialType) => [lm(material, width, materialType), lm(material, width, materialType)];

// a cotton that was never in any map - the class answer every cotton must now get
const PLAIN = "Some Cotton Nobody Listed";

describe("estimatePrintLength - degraded path (no catalogue), ETAP 2g-2", () => {
  it.each([
    ["Hector Linen", 720],
    ["Organic Blossom Muslin Gauze", 700],
    ["Organic Stratos Linen", 700],
    ["Organic Nimbus Linen", 700],
  ])("%s packs like any cotton: class roll width 1420, not another shop's per-fabric value", (fabric, width) => {
    expect(rows(pair(fabric, width))).toBe(rows(pair(PLAIN, width)));
  });

  it("the class roll width for cotton is 1420: 2 x 700 fits one row, 2 x 720 does not", () => {
    expect(rows(pair(PLAIN, 700))).toBe(1);
    expect(rows(pair(PLAIN, 720))).toBe(2);
  });

  it("polyester keeps LM_ROLL_POLY (1550) on the degraded path: 2 x 770 fits one row", () => {
    expect(rows(pair("Any Poly", 770, "Polyesters"))).toBe(1);
    expect(rows(pair("Any Poly", 780, "Polyesters"))).toBe(2);
  });

  it("with a catalogue the fabric's OWN roll width still wins (only the degraded path changed)", () => {
    const config = { globals: {}, fabrics: [{ name: "Hector Linen", rollWidth: 1460 }] };
    expect(rows(pair("Hector Linen", 720), config)).toBe(1);
  });
});
