// ── Margins (mm added to height per item during estimation) ──────────────────
export const MARGIN_COTTON = 10;
export const MARGIN_POLY = 5;

// ── LM – XML widths (written to PrintFactory <Width>) ────────────────────────
export const LM_XML_POLY = 1420;
export const LM_XML_COTTON_DEFAULT = 1420;
// (The per-fabric map LM_XML_COTTON - Alex's names - had no reader since 0bf8aa6: removed
// in ETAP 2g-1. XML widths come from the fabric catalogue.)

// ── LM – Roll widths for print-length estimation ──────────────────────────────
// LM_ROLL_COTTON below is read ONLY by the degraded path of estimatePrintLength (catalogue
// not loaded); it carries Alex's fabric names and goes in ETAP 2g-2.
export const LM_ROLL_POLY = 1550;
export const LM_ROLL_COTTON_DEFAULT = 1420;
export const LM_ROLL_COTTON = {
  "Cotton Slub": 1420,
  "Stretch Lycra French Terry": 1420,
  "Poppy Lycra Jersey": 1420,
  "Organic Jersey Interlock": 1420,
  "Organic Iris Jersey": 1420,
  "Single Cotton Elastane Jersey": 1420,
  "DSTK - Stretch Lycra French Terry": 1420,
  "Organic Drill Natural": 1420,
  Panama: 1420,
  "Organic Leve Panama Natural": 1420,
  "Hector Linen": 1460,
  Poplin: 1420,
  "Light Twill": 1420,
  "Organic Drill Optic": 1420,
  "Organic Optic Calico": 1420,
  Satin: 1420,
  "Top Sateen": 1420,
  "Organic Blossom Muslin Gauze": 1270,
  "Organic Panama Natural": 1420,
  "Organic Leve Cotton Panama Natural": 1420,
  "Organic Jasmine Lycra Jersey": 1420,
  "Cotton Denim": 1420,
  "Organic Poplin": 1420,
  "Organic Satin": 1420,
  "Optic White Organic Panama": 1420,
  "Melino Linen": 1420,
  "Limani Linen": 1420,
  "DSTK - Organic Jersey Interlock": 1420,
  "Organic Stratos Linen": 1370,
  "Organic Nimbus Linen": 1370,
  "Organic Calico Natural": 1420,
  "Calico Plain Cotton": 1420,
  Drill: 1420,
};

// ── Fixed product dimensions (width × height in mm) ──────────────────────────
export const DIMS_SAMPLE = { width: 220, height: 200 };
export const DIMS_FQ = { width: 670, height: 480 };
export const DIMS_TEA_TOWEL = { width: 700, height: 500 };
