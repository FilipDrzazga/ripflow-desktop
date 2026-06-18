import { describe, it, expect } from "vitest";
import { groupByOrder } from "./groupByOrder";
import { PRODUCTION_STAGE } from "../../shared/constants";

const row = (overrides) => ({
  file_id: "f",
  order_id: "1001",
  customer_name: "Alice",
  stage: PRODUCTION_STAGE.PRINTED,
  batch_path: "O:\\PRINTED\\B1",
  material: "Cotton",
  print_type: "LM",
  ...overrides,
});

describe("groupByOrder", () => {
  it("collapses files from different batches and materials under one orderId", () => {
    const rows = [
      row({ file_id: "a", order_id: "1001", batch_path: "O:\\PRINTED\\B1", material: "Cotton", stage: PRODUCTION_STAGE.PRINTED }),
      row({ file_id: "b", order_id: "1001", batch_path: "O:\\PRINTED\\B2", material: "Polyester", stage: PRODUCTION_STAGE.QC }),
      row({ file_id: "c", order_id: "1001", batch_path: "O:\\PRINTED\\B3", material: "Linen", stage: PRODUCTION_STAGE.PRINTED }),
    ];

    const groups = groupByOrder(rows);

    expect(groups).toHaveLength(1);
    const order = groups[0];
    expect(order.orderId).toBe("1001");
    expect(order.isUnknown).toBe(false);
    expect(order.totalFiles).toBe(3);
    expect(order.files).toHaveLength(3);
    // counts collapse across batches/materials
    expect(order.stageCounts[PRODUCTION_STAGE.PRINTED]).toBe(2);
    expect(order.stageCounts[PRODUCTION_STAGE.QC]).toBe(1);
    expect(order.shippedCount).toBe(0);
    expect(order.allKnownFilesShipped).toBe(false);
  });

  it("places rows with missing/empty order_id into the unknown bucket, never dropping them", () => {
    const rows = [
      row({ file_id: "a", order_id: "1001" }),
      row({ file_id: "b", order_id: "" }),
      row({ file_id: "c", order_id: "   " }),
      row({ file_id: "d", order_id: null }),
      row({ file_id: "e", order_id: undefined }),
    ];

    const groups = groupByOrder(rows);

    expect(groups).toHaveLength(2);
    const unknown = groups.find((g) => g.isUnknown);
    expect(unknown).toBeDefined();
    expect(unknown.orderId).toBeNull();
    expect(unknown.totalFiles).toBe(4); // b, c, d, e all collapse here
    // no files are lost
    const totalGrouped = groups.reduce((sum, g) => sum + g.totalFiles, 0);
    expect(totalGrouped).toBe(rows.length);
    // unknown bucket is always last
    expect(groups[groups.length - 1].isUnknown).toBe(true);
  });

  it("flags allKnownFilesShipped only when every tracked file is shipped", () => {
    const allShipped = groupByOrder([
      row({ file_id: "a", order_id: "2002", stage: PRODUCTION_STAGE.SHIPPED }),
      row({ file_id: "b", order_id: "2002", stage: PRODUCTION_STAGE.SHIPPED }),
    ]);
    expect(allShipped[0].allKnownFilesShipped).toBe(true);
    expect(allShipped[0].shippedCount).toBe(2);

    const partial = groupByOrder([
      row({ file_id: "a", order_id: "2002", stage: PRODUCTION_STAGE.SHIPPED }),
      row({ file_id: "b", order_id: "2002", stage: PRODUCTION_STAGE.QC }),
    ]);
    expect(partial[0].allKnownFilesShipped).toBe(false);
  });

  it("returns an empty array for no rows and tolerates null entries", () => {
    expect(groupByOrder([])).toEqual([]);
    expect(groupByOrder([null, undefined])).toEqual([]);
  });
});
