import { PRODUCTION_STAGE } from "../../shared/constants";
import { isShippableRow } from "./markShipped";

// Stages an order's file can still sit at BEFORE packed. The "other files not packed yet" hint counts these;
// packed and shipped files are done as far as this lens cares.
const NOT_PACKED_YET = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING,
  PRODUCTION_STAGE.FROM_SEWING,
];

// What the Receive lens's ship button acts on: the picked items of the open order when the operator
// picked any, else the whole order. Only rows that can jump to shipped; ids the selection holds from
// outside the open order are ignored (a selection never survives an order change, but stay safe).
export const shipTargetIds = (orderFiles, selectedFileIds) => {
  const picked = orderFiles.filter((f) => selectedFileIds.has(f.file_id));
  const pool = picked.length > 0 ? picked : orderFiles;
  return { ids: pool.filter(isShippableRow).map((f) => f.file_id), fromSelection: picked.length > 0 };
};

// Files of the same order that the open order list does not show and that have not reached packed - the
// parcel may complete only part of an order. Information for the operator, never a gate: whether the order
// is complete is decided in Shopify, not here. The unknown-order bucket (orderId null) has no real order, so it counts 0.
export const otherUnpackedCount = (allRows, order) => {
  if (!order?.orderId) return 0;
  const shown = new Set(order.files.map((f) => f.file_id));
  return allRows.filter(
    (r) =>
      typeof r?.order_id === "string" &&
      r.order_id.trim() === order.orderId &&
      !shown.has(r.file_id) &&
      NOT_PACKED_YET.includes(r.stage),
  ).length;
};
