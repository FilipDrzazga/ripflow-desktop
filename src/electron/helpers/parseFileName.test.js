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

// Round 2: material tokenization and customer-name edge cases. All are READY
// (not error paths); assertions focus on material, customerName, xOfY, status, errors.
describe("parsePrintFileName — material & customer name edge cases", () => {
  it("material with parentheses in a single token", () => {
    const out = parse(
      `ON312649_Anna_Nowak_1of1_Neraki Waterproof Canvas FR (Water Repellant)_3x_Linear Meter - 1m increments_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("LM");
    expect(out.material).toBe("Neraki Waterproof Canvas FR (Water Repellant)");
    expect(out.customerName).toBe("Anna Nowak");
    expect(out.qty).toBe(3); // "3x" → 3
  });

  it("material with parentheses split by '_' — merge-parens rejoins it", () => {
    // The "(Water Repellant)" token starts with "(" so tokenize merges it back into
    // the previous token with a space → identical material as the single-token case.
    const out = parse(
      `ON312650_Anna_Nowak_1of1_Neraki Waterproof Canvas FR_(Water Repellant)_3x_Linear Meter - 1m increments_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("LM");
    expect(out.material).toBe("Neraki Waterproof Canvas FR (Water Repellant)");
    expect(out.customerName).toBe("Anna Nowak");
    expect(out.qty).toBe(3);
  });

  it("material containing ' - ' keeps the full name (not cut at the dash)", () => {
    const out = parse(
      `ON312809_Kate_Brown_2of7_DSTK - Paros Stretch Twill_1x_Sample Print - 20 x 20 cm_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("SAMPLE");
    // NOTE: the dash inside the material name is preserved; nothing is stripped here.
    expect(out.material).toBe("DSTK - Paros Stretch Twill");
    expect(out.customerName).toBe("Kate Brown");
  });

  it("multi-token customer name (token contains a space)", () => {
    // "Iwona_F Adams" → tokens "Iwona" + "F Adams" joined with a space.
    const out = parse(
      "ON312913_Iwona_F Adams_1of9_Custom Square Cushion_Eco Velvet _ 45 x 45 cm _ Print both sides_2_FF_3016.pdf",
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("CUSHION");
    expect(out.customerName).toBe("Iwona F Adams");
    expect(out.material).toBe("Eco Velvet");
  });

  it("customer name with a diacritic is preserved verbatim", () => {
    const out = parse(
      `ON312760_Céline_Dubois_1of1_Eco Linen Look_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("LM");
    expect(out.customerName).toBe("Céline Dubois");
    expect(out.material).toBe("Eco Linen Look");
  });

  it("ALL-CAPS customer name is not normalized", () => {
    const out = parse(
      `ON312809_KATE_BROWN_2of7_DSTK - Paros Stretch Twill_1x_Sample Print - 20 x 20 cm_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    // NOTE: parser keeps letter casing as-is — no upper/lower normalization.
    expect(out.customerName).toBe("KATE BROWN");
    expect(out.material).toBe("DSTK - Paros Stretch Twill");
  });

  it("lowercase customer + two-digit xOfY", () => {
    const out = parse(
      `ON312673_emma_clark_4of12_Stretch Jersey_1x_Fat Quarter - 65 x 48 cm_${XWD}_FF.pdf`,
    );

    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.printTypeCode).toBe("FQ");
    expect(out.customerName).toBe("emma clark");
    expect(out.xOfY).toBe("4of12");
    expect(out.x).toBe(4);
    expect(out.y).toBe(12); // multi-digit y parsed correctly
  });
});

// Round 3: validation / error paths. errors is an array of { code, message } objects,
// so presence is asserted via errors.some(e => e.code === ...). Many cases trip several
// codes at once (removing a token shifts positional parsing); we assert only the relevant
// code and document the companions in // NOTE: comments.
describe("parsePrintFileName — validation / error paths", () => {
  const hasCode = (out, code) => out.errors.some((e) => e.code === code);

  it("MISSING_ORDER_ID — no ON token", () => {
    const out = parse(`Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_ORDER_ID")).toBe(true);
    // NOTE: this is the only error here — the rest still parses (printType LM, material, qty).
  });

  it("MISSING_XOFY — no xOfY token", () => {
    const out = parse(`ON312819_Beata_Kowalska_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_XOFY")).toBe(true);
    // NOTE: removing xOfY breaks positional parsing → also MISSING_PRINT_TYPE (x2),
    // MISSING_MATERIAL, MISSING_QTY; printTypeCode ends UNKNOWN.
  });

  it("BAD_XOFY — x > y (5of2)", () => {
    const out = parse(`ON312819_Beata_Kowalska_5of2_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "BAD_XOFY")).toBe(true);
    expect(out.x).toBe(5);
    expect(out.y).toBe(2);
  });

  it("BAD_XOFY — x <= 0 (0of3)", () => {
    const out = parse(`ON312819_Beata_Kowalska_0of3_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "BAD_XOFY")).toBe(true);
    // NOTE: x=0 trips BAD_XOFY via the x>0 sanity check (same code as the x>y case).
    expect(out.x).toBe(0);
  });

  it("MISSING_PRINT_TYPE — unrecognizable type text but XWD present", () => {
    const out = parse(`ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Mystery Format_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_PRINT_TYPE")).toBe(true);
    // NOTE: kind stays XWD_BASED but detectPrintTypeFromText → UNKNOWN, so MISSING_PRINT_TYPE
    // is emitted twice (XWD-branch check + validateCommon). printTypeCode = UNKNOWN.
    expect(out.printTypeCode).toBe("UNKNOWN");
  });

  it("BAD_QTY — qty 0x", () => {
    const out = parse(`ON312819_Beata_Kowalska_1of1_Stretch Jersey_0x_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "BAD_QTY")).toBe(true);
    expect(out.qty).toBe(0); // "0x" parses to 0, then BAD_QTY (qty <= 0)
  });

  it("MISSING_MATERIAL — nothing parseable after xOfY", () => {
    // NOTE (investigated): material is positional (token after xOfY). The "minimal slot"
    // attempts (e.g. ...1of1_XWD_FF) do NOT fire MISSING_MATERIAL — the XWD token simply
    // becomes the material. MISSING_MATERIAL only fires when there is truly nothing after
    // xOfY (kind then falls to UNKNOWN).
    const out = parse("ON312819_Beata_Kowalska_1of1.pdf");
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_MATERIAL")).toBe(true);
    expect(out.material).toBeNull();
    // NOTE: companions — UNKNOWN_FORMAT, MISSING_PRINT_TYPE, MISSING_QTY.
  });

  it("MISSING_QTY — qty token absent (XWD-based)", () => {
    const out = parse(`ON312819_Beata_Kowalska_1of1_Stretch Jersey_Linear Meter - 1m increments_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_QTY")).toBe(true);
    // NOTE: dropping the "1x" token shifts the type/variant chunk, so detectPrintType →
    // UNKNOWN and MISSING_PRINT_TYPE (x2) also fire; material stays "Stretch Jersey".
  });

  it("MISSING_ARTWORK_ID — looks like LM but no XWD token (contract conflict)", () => {
    const out = parse("ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_FF.pdf");
    // NOTE (investigated): with no XWD token, detectKind → UNKNOWN, so the best-effort
    // branch runs → it sets printTypeCode = LM from the text "linear meter", and adds
    // UNKNOWN_FORMAT. validateByType then sees LM with no artworkId → MISSING_ARTWORK_ID.
    // So BOTH fire (plus MISSING_MATERIAL + MISSING_QTY, since the UNKNOWN branch does not
    // parse material/qty). printTypeCode = LM, kind-wise it was UNKNOWN.
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "UNKNOWN_FORMAT")).toBe(true);
    expect(hasCode(out, "MISSING_ARTWORK_ID")).toBe(true);
    expect(out.printTypeCode).toBe("LM");
    expect(out.artworkId).toBeNull();
  });

  it("FQ MISSING_SIZE — FQ with XWD but no dimensions in text", () => {
    const out = parse(`ON311936_Diana_Smith_2of6_Palatine Velvet FR_1x_Fat Quarter_${XWD}_FF.pdf`);
    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "MISSING_SIZE")).toBe(true);
    // Clean single error: printTypeCode FQ, size null, variant "Fat Quarter".
    expect(out.printTypeCode).toBe("FQ");
    expect(out.size).toBeNull();
  });

  it("CUSHION without FF / size — positional fallback (no MISSING_INTERNAL_ID)", () => {
    const out = parse("ON312913_Iwona_Adams_1of9_Custom Square Cushion_Eco Velvet _ Print both sides_2.pdf");
    expect(out.status).toBe("INVALID");
    expect(out.printTypeCode).toBe("CUSHION");
    expect(hasCode(out, "MISSING_QTY")).toBe(true);
    // NOTE: the brief-expected MISSING_INTERNAL_ID / MISSING_SIZE do NOT fire here. Without
    // an FF token the last token "2" becomes internalId, and positional shift puts
    // "Print both sides" into size — so only MISSING_QTY trips (qty derived from before-FF).
    expect(out.internalId).toBe("2");
    expect(out.size).toBe("Print both sides");
    expect(hasCode(out, "MISSING_INTERNAL_ID")).toBe(false);
    expect(hasCode(out, "MISSING_SIZE")).toBe(false);
  });

  it("TEA_TOWEL without FF / variant — positional fallback (no MISSING_INTERNAL_ID)", () => {
    const out = parse("ON312896_Karol_Lewis_1of2_Custom Tea Towel_Drill_50.pdf");
    expect(out.status).toBe("INVALID");
    expect(out.printTypeCode).toBe("TEA_TOWEL");
    expect(hasCode(out, "MISSING_QTY")).toBe(true);
    // NOTE: same positional fallback — last token "50" becomes internalId and variant,
    // so neither MISSING_INTERNAL_ID nor MISSING_VARIANT fires with this name; only
    // MISSING_QTY. (With an FF token present but no variant, MISSING_VARIANT does fire.)
    expect(out.internalId).toBe("50");
    expect(hasCode(out, "MISSING_INTERNAL_ID")).toBe(false);
  });

  it("missing FF token — warning only, still READY", () => {
    const out = parse(`ON312819_Beata_Kowalska_1of1_Stretch Jersey_1x_Linear Meter - 1m increments_${XWD}.pdf`);
    expect(out.status).toBe("READY");
    expect(out.errors).toEqual([]);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings.some((w) => /FF/.test(w))).toBe(true);
    // NOTE: the FF warning is emitted twice (the XWD parser + validateCommon both add one),
    // so warnings.length === 2 here — kept as-is, not asserted exactly.
  });
});

// Round 4: UNKNOWN kind with no inferable type, plus contract-invariant guards
// (the parser must never throw and always return a status object).
describe("parsePrintFileName — UNKNOWN kind & contract guards", () => {
  const hasCode = (out, code) => out.errors.some((e) => e.code === code);

  it("UNKNOWN kind with no inferable type — printTypeCode stays UNKNOWN", () => {
    const out = parse("ON312819_Beata_Kowalska_1of1_Some Fabric_1x_Totally Unrecognised Format_FF.pdf");

    expect(out.status).toBe("INVALID");
    expect(hasCode(out, "UNKNOWN_FORMAT")).toBe(true);
    // NOTE: contrast with the MISSING_ARTWORK_ID case — there the text "linear meter" let
    // the best-effort branch set printTypeCode = LM. Here the type text is unrecognizable,
    // so printTypeCode stays UNKNOWN. Companions: MISSING_PRINT_TYPE, MISSING_MATERIAL,
    // MISSING_QTY (asserting only UNKNOWN_FORMAT).
    expect(out.printTypeCode).toBe("UNKNOWN");
    // best-effort still fills orderId / xOfY even for UNKNOWN kind:
    expect(out.orderId).toBe("ON312819");
    expect(out.xOfY).toBe("1of1");
  });

  // Contract invariant (return shape §4.1): parser never throws, always returns an object
  // with a `file` field and a `status` — even on garbage input.
  it.each([
    ["empty string", ""],
    ["no underscore", "randomfile.pdf"],
    ["separator + ext only", "_.pdf"],
    ["only separators", "___"],
  ])("never throws / returns a status object — %s", (_label, input) => {
    let out;
    expect(() => { out = parse(input); }).not.toThrow();
    expect(out).not.toBeNull();
    expect(typeof out).toBe("object");
    expect(out.file).toBeTruthy();
    // NOTE: all four garbage inputs yield status "INVALID" with the full common-error set
    // (UNKNOWN_FORMAT + MISSING_ORDER_ID / MISSING_XOFY / MISSING_PRINT_TYPE /
    // MISSING_MATERIAL / MISSING_QTY).
    expect(out.status).toBe("INVALID");
  });
});
