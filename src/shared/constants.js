export const BATCH_STATUS = {
  ACTIVE: "active",
  ROLLED_BACK: "rolled_back",
};

export const FILE_STATUS = {
  READY: "READY",
  INVALID: "INVALID",
  WARNING: "WARNING",
  // An inbox PDF still being written (see helpers/pdfReadiness.js): listed, never selectable.
  COPYING: "COPYING",
  ROLLED_BACK: "rolled_back",
};

export const CUSTOM_ORDER_STATUS = {
  COMPLETE: "complete",
  PARTIAL: "partial",
};

export const PRODUCTION_STAGE = {
  PRINTED:      "printed",
  HEATPRESS:    "heatpress",
  QC:           "qc",
  TO_SEWING:    "to_sewing",
  FROM_SEWING:  "from_sewing",
  PACKED:       "packed",
  SHIPPED:      "shipped",
  REJECTED:     "rejected",
  OVERRIDDEN:   "overridden",
};

export const STAGE_NEXT = {
  printed:     "heatpress",
  heatpress:   "qc",
  qc:          "packed",
  from_sewing: "packed",
  packed:      "shipped",
};

export const STAGE_PREV = {
  heatpress:   "printed",
  qc:          "heatpress",
  to_sewing:   "qc",
  from_sewing: "to_sewing",
  packed:      "qc",
  shipped:     "packed",
};

// Stages a file can be marked shipped from in ONE move ("Mark as Shipped" in Production), skipping
// every stage in between. Legacy rejected/overridden rows and shipped itself are not offered.
export const MARK_SHIPPED_FROM = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING,
  PRODUCTION_STAGE.FROM_SEWING,
  PRODUCTION_STAGE.PACKED,
];

export const STAGE_LABEL = {
  printed:     "Printed",
  heatpress:   "Heat Press",
  qc:          "QC",
  to_sewing:   "To Sewing",
  from_sewing: "From Sewing",
  packed:      "Packed",
  shipped:     "Shipped",
  rejected:    "Rejected",
  overridden:  "Overridden",
};

export const STAGE_SHORT_LABEL = {
  [PRODUCTION_STAGE.PRINTED]:     "Print",
  [PRODUCTION_STAGE.HEATPRESS]:   "Press",
  [PRODUCTION_STAGE.QC]:          "QC",
  [PRODUCTION_STAGE.TO_SEWING]:   "Sew Out",
  [PRODUCTION_STAGE.FROM_SEWING]: "Sew In",
  [PRODUCTION_STAGE.PACKED]:      "Pack",
  [PRODUCTION_STAGE.SHIPPED]:     "Ship",
};

export const STAGE_COLOR = {
  printed:     { bg: "#f0f0f0", color: "#616161" },
  heatpress:   { bg: "#fff3cd", color: "#856404" },
  qc:          { bg: "#cfe2ff", color: "#084298" },
  to_sewing:   { bg: "#e2d9f3", color: "#432874" },
  from_sewing: { bg: "#d1ecf1", color: "#0c5460" },
  packed:      { bg: "#d4edda", color: "#155724" },
  shipped:     { bg: "#ede9fe", color: "#534AB7" },
  rejected:    { bg: "#ffe7e5", color: "#e63641" },
  overridden:  { bg: "#f1f1f1", color: "#909090" },
};

export const SEWING_SUGGESTED_TYPES = ["CUSHION", "TEA_TOWEL"];

// rip_errors.scope - what a PrintFactory failure hit. FILE: one document failed after the Split
// node (the badge sits on that file). BATCH: the job failed before the split, so every file of the
// batch got a row (badge on every file AND on the batch header). NULL in rows written before the
// column existed = FILE.
export const RIP_ERROR_SCOPE = {
  FILE: "file",
  BATCH: "batch",
};

// The code profile:set answers when the stored shop profile is no longer the one this station
// loaded - another station saved it in between (ETAP 3-1, helpers/saveShopProfile.js).
export const PROFILE_CHANGED = "PROFILE_CHANGED";

// Where one Etsy order line stands in the import (etsy_imports.state, E3b-2).
//   PENDING       - claimed; the file is being (or was being) copied into the inbox
//   DONE          - the file is in the inbox under its name
//   NEEDS_REVIEW  - not imported, with a reason a person reads (nothing is guessed, nothing is skipped silently)
//   FAILED        - the copy itself failed after the claim
//   RETRY         - a person asked the importer to look at the line again (E4), optionally with the XWD
//                   number typed in (etsy_imports.manual_xwd); only the importer station acts on it
//   DISMISSED     - a person said the line is not a print (a Sample Book, a Tea Towel...); never imported
export const ETSY_IMPORT_STATE = {
  PENDING: "pending",
  DONE: "done",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
  RETRY: "retry",
  DISMISSED: "dismissed",
};

// The states a person can act on from the Inbox bar (E4): retry or dismiss. RETRY is listed too, so the
// bar shows a request that is still waiting for the importer.
export const ETSY_IMPORT_OPEN_STATES = [ETSY_IMPORT_STATE.NEEDS_REVIEW, ETSY_IMPORT_STATE.FAILED, ETSY_IMPORT_STATE.RETRY];

// A number typed into the bar (and the bare SKU, etsyTransaction.js): every library number is six digits.
export const ETSY_XWD_INPUT_RE = /^\d{6}$/;

// The reason the importer gives a PENDING line it found left over from an interrupted copy (the file may already
// be in a batch). One text for the engine that writes it and the Inbox bar that asks for a confirmation on it.
export const ETSY_IMPORT_INTERRUPTED_REASON =
  "The import was interrupted and the file is not in the inbox - check PRINTED and Production before importing this line again.";
