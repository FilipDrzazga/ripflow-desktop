// ── Margins (mm added to height per item during estimation) ──────────────────
export const MARGIN_COTTON = 10;
export const MARGIN_POLY = 5;

// ── LM – XML widths (written to PrintFactory <Width>) ────────────────────────
export const LM_XML_POLY = 1420;
export const LM_XML_COTTON_DEFAULT = 1420;
// (The per-fabric map LM_XML_COTTON - Alex's names - had no reader since 0bf8aa6: removed
// in ETAP 2g-1. XML widths come from the fabric catalogue.)

// ── LM – Roll widths for print-length estimation ──────────────────────────────
// CLASS roll widths - the degraded path of estimatePrintLength (catalogue not loaded) uses
// them for every fabric of the class. The per-fabric map LM_ROLL_COTTON (Alex's names) was
// removed in ETAP 2g-2. With these, printWidths.js carries no client's data any more - only
// the degraded path's class defaults (and the product dimensions below, ETAP 5).
export const LM_ROLL_POLY = 1550;
export const LM_ROLL_COTTON_DEFAULT = 1420;

// ── Fixed product dimensions (width × height in mm) ──────────────────────────
export const DIMS_SAMPLE = { width: 220, height: 200 };
export const DIMS_FQ = { width: 670, height: 480 };
export const DIMS_TEA_TOWEL = { width: 700, height: 500 };
