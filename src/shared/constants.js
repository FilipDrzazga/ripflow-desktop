export const BATCH_STATUS = {
  ACTIVE: "active",
  ROLLED_BACK: "rolled_back",
};

export const FILE_STATUS = {
  READY: "READY",
  INVALID: "INVALID",
  WARNING: "WARNING",
  ROLLED_BACK: "rolled_back",
};

export const PRINTER = {
  DGEN: "DGEN",
  YOKO: "YOKO",
  YUMI: "YUMI",
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

export const QC_ACTION = {
  PASS:    "pass",
  REJECT:  "reject",
  SEWING:  "sewing",
  PENDING: "pending",
};

export const SEWING_SUGGESTED_TYPES = ["CUSHION", "TEA_TOWEL"];
