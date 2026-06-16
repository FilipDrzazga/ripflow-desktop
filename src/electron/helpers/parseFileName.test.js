import { describe, it, expect, vi } from "vitest";

// Isolate from fabricCache so importing the parser never pulls in the native
// better-sqlite3 / electron chain, and the LM XML width is deterministic (1420).
// POLY_MATERIALS is intentionally NOT mocked — it is a static Set in
// getMaterialType.js and the parser computes isPoly from it on its own.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Unknown",
}));

import { parsePrintFileName } from "./parseFileName.js";

// A single fictitious XWD token, reused as the expected artworkId.
const XWD = "XWD1a2b3c4d5e";

// Anonymised filenames (no real customer PII), one per print type.
const NAMES = {
  LM: `ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`,
  FQ: `ON311936_Diana_Smith_2of6_Palatine Velvet FR_1x_Fat Quarter - 65 x 48 cm_${XWD}_FF.pdf`,
  SAMPLE: `ON312405_Hanna_Wilson_1of3_Stretch Jersey_1x_Sample Print - 20 x 20 cm_${XWD}_FF.pdf`,
  CUSHION: "ON312913_Iwona_Adams_1of9_Custom Square Cushion_Eco Velvet _ 45 x 45 cm _ Print both sides_2_FF_3016.pdf",
  TEA_TOWEL: "ON312896_Karol_Lewis_1of2_Custom Tea Towel_Drill _ Fully Sewn_50_FF_2998.pdf",
};

const parse = (name) => parsePrintFileName(name, { dir: "C:\\inbox", fullPath: `C:\\inbox\\${name}` });

// Characterization tests — they document the CURRENT parser behaviour as a
// regression baseline. They do not assert "correct" behaviour; where the parser
// does something surprising it is captured as-is with a // NOTE: comment.
describe("parsePrintFileName — happy path per print type", () => {
  it("LM (Linear Meter, XWD-based)", () => {
    const out = parse(NAMES.LM);

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("LM");
    expect(out.printType).toBe("Linear Meter");
    expect(out.orderId).toBe("ON312819");
    expect(out.customerName).toBe("Beata Kowalska");
    expect(out.xOfY).toBe("1of1");
    expect(out.x).toBe(1);
    expect(out.y).toBe(1);
    expect(out.material).toBe("Stretch Jersey");
    expect(out.qty).toBe(1); // "1x" → 1
    expect(out.artworkId).toBe(XWD);
    expect(out.internalId).toBeNull();
    expect(out.size).toBeNull();
    // applyLmDimensions override for LM: width from cache mock, height = qty * 1000mm.
    expect(out.width).toBe(1420);
    expect(out.height).toBe(1000);
    // NOTE: variant is the type/variant chunk with the "Linear Meter - " prefix stripped.
    expect(out.variant).toBe("1m increments");
  });

  it("FQ (Fat Quarter, XWD-based)", () => {
    const out = parse(NAMES.FQ);

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("FQ");
    expect(out.printType).toBe("Fat Quarter");
    expect(out.orderId).toBe("ON311936");
    expect(out.customerName).toBe("Diana Smith");
    expect(out.xOfY).toBe("2of6");
    expect(out.x).toBe(2);
    expect(out.y).toBe(6);
    expect(out.material).toBe("Palatine Velvet FR");
    expect(out.qty).toBe(1);
    expect(out.artworkId).toBe(XWD);
    expect(out.size).toBe("65 x 48 cm");
    // NOTE: fixed product dimensions override the parsed size text. The size string
    // stays "65 x 48 cm" but width/height come from DIMS_FQ (670 x 480), not 650 x 480.
    expect(out.width).toBe(670);
    expect(out.height).toBe(480);
    // NOTE: for FQ, variant ends up equal to the size string ("Fat Quarter - " stripped).
    expect(out.variant).toBe("65 x 48 cm");
  });

  it("SAMPLE (Sample Print, XWD-based)", () => {
    const out = parse(NAMES.SAMPLE);

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("SAMPLE");
    expect(out.printType).toBe("Sample");
    expect(out.orderId).toBe("ON312405");
    expect(out.customerName).toBe("Hanna Wilson");
    expect(out.xOfY).toBe("1of3");
    expect(out.x).toBe(1);
    expect(out.y).toBe(3);
    expect(out.material).toBe("Stretch Jersey");
    expect(out.qty).toBe(1);
    expect(out.artworkId).toBe(XWD);
    expect(out.size).toBe("20 x 20 cm");
    // NOTE: DIMS_SAMPLE override → width 220 (NOT 200 from the "20 x 20 cm" text), height 200.
    expect(out.width).toBe(220);
    expect(out.height).toBe(200);
    // NOTE: variant equals the size string for SAMPLE too.
    expect(out.variant).toBe("20 x 20 cm");
  });

  it("CUSHION (Custom Square Cushion)", () => {
    const out = parse(NAMES.CUSHION);

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("CUSHION");
    expect(out.printType).toBe("Cushion");
    expect(out.orderId).toBe("ON312913");
    expect(out.customerName).toBe("Iwona Adams");
    expect(out.xOfY).toBe("1of9");
    expect(out.x).toBe(1);
    expect(out.y).toBe(9);
    expect(out.productName).toBe("Custom Square Cushion");
    expect(out.material).toBe("Eco Velvet");
    expect(out.qty).toBe(2); // bare number before FF
    expect(out.size).toBe("45 x 45 cm");
    expect(out.variant).toBe("Print both sides");
    expect(out.internalId).toBe("3016"); // token after FF
    expect(out.artworkId).toBeNull();
    // Cushion keeps the parsed size: "45 x 45 cm" → 450 x 450 mm (no fixed override).
    expect(out.width).toBe(450);
    expect(out.height).toBe(450);
  });

  it("TEA_TOWEL (Custom Tea Towel)", () => {
    const out = parse(NAMES.TEA_TOWEL);

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("TEA_TOWEL");
    expect(out.printType).toBe("Tea Towel");
    expect(out.orderId).toBe("ON312896");
    expect(out.customerName).toBe("Karol Lewis");
    expect(out.xOfY).toBe("1of2");
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.productName).toBe("Custom Tea Towel");
    expect(out.material).toBe("Drill");
    expect(out.qty).toBe(50); // bare number before FF
    expect(out.variant).toBe("Fully Sewn");
    expect(out.internalId).toBe("2998");
    expect(out.artworkId).toBeNull();
    expect(out.size).toBeNull();
    // applyTeaTowelDimensions → fixed DIMS_TEA_TOWEL 700 x 500.
    expect(out.width).toBe(700);
    expect(out.height).toBe(500);
  });
});
