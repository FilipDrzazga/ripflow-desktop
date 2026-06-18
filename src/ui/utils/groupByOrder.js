import { PRODUCTION_STAGE } from "../../shared/constants";

// Canonical stage order for rendering stage-count pills. Built from the
// PRODUCTION_STAGE constants (not raw strings) so the order matches the
// Production batch view and stays correct if a stage is ever reordered. If a
// new stage is added, list it here and pill ordering keeps working.
export const ORDER_STAGE_PIPELINE = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING,
  PRODUCTION_STAGE.FROM_SEWING,
  PRODUCTION_STAGE.PACKED,
  PRODUCTION_STAGE.SHIPPED,
];

// Label shown for files that carry no usable order_id. They are never dropped —
// they collapse into one dedicated bucket so the grouping is lossless.
export const UNKNOWN_ORDER_LABEL = "Unknown order";

const hasOrderId = (row) => typeof row?.order_id === "string" && row.order_id.trim() !== "";

/**
 * Group production stage rows by their order_id.
 *
 * One order's files can span multiple batches, materials and print types — this
 * collapses all of them under a single order. Rows with a missing/empty/whitespace
 * order_id are surfaced in a single "unknown order" bucket (isUnknown: true),
 * never silently dropped.
 *
 * @param {Array<object>} stageRows — stage rows (e.g. Object.values(productionStages))
 * @returns {Array<object>} order groups (see shape below), known orders first,
 *                          the unknown bucket always last.
 */
export const groupByOrder = (stageRows = []) => {
  const map = new Map();

  for (const row of stageRows) {
    if (!row) continue;
    const orderId = hasOrderId(row) ? row.order_id.trim() : null;
    const bucketKey = orderId ?? "__UNKNOWN_ORDER__";
    if (!map.has(bucketKey)) {
      map.set(bucketKey, {
        orderId,                  // null for the unknown bucket
        customerName: null,
        files: [],
        isUnknown: orderId === null,
      });
    }
    const group = map.get(bucketKey);
    group.files.push(row);
    // First non-empty customer name wins — files of one order share a customer.
    if (!group.customerName && row.customer_name) group.customerName = row.customer_name;
  }

  const groups = [...map.values()].map((group) => {
    // Count only stages actually present, inserted in canonical pipeline order so
    // the iteration order of stageCounts matches the batch view's pill ordering.
    const stageCounts = {};
    for (const stage of ORDER_STAGE_PIPELINE) {
      const n = group.files.filter((f) => f.stage === stage).length;
      if (n > 0) stageCounts[stage] = n;
    }

    const totalFiles = group.files.length;
    const shippedCount = stageCounts[PRODUCTION_STAGE.SHIPPED] ?? 0;

    // allKnownFilesShipped: every file we CURRENTLY track for this order has
    // reached the shipped stage. This is NOT true order completeness — real
    // completeness depends on Shopify line-item data we do not have yet (a later
    // stage). Conflating the two would cause bugs, hence the deliberate name.
    // It also only reflects files still inside the shipped retention window
    // (cleanupShippedStages / shippedRetentionDays purges old shipped rows), so
    // an order can lose shipped files from this count after the retention period.
    const allKnownFilesShipped = totalFiles > 0 && shippedCount === totalFiles;

    return { ...group, stageCounts, totalFiles, shippedCount, allKnownFilesShipped };
  });

  // Stable order: known orders first (by orderId), the unknown bucket always last.
  groups.sort((a, b) => {
    if (a.isUnknown) return 1;
    if (b.isUnknown) return -1;
    return String(a.orderId).localeCompare(String(b.orderId));
  });

  return groups;
};
