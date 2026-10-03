import { describe, it, expect } from "vitest";
import { canMarkShipped, isShippableRow } from "./markShipped";
import { MARK_SHIPPED_FROM, PRODUCTION_STAGE } from "../../shared/constants";

const rows = (...stages) => stages.map((stage, i) => ({ file_id: `f${i}`, stage }));

describe("isShippableRow", () => {
  it("accepts packed - the per-file check the handler uses, unlike the menu's all-packed rule", () => {
    expect(isShippableRow({ stage: "packed" })).toBe(true);
  });

  it("refuses shipped, legacy stages and a missing row", () => {
    expect(isShippableRow({ stage: "shipped" })).toBe(false);
    expect(isShippableRow({ stage: "rejected" })).toBe(false);
    expect(isShippableRow(undefined)).toBe(false);
  });
});

describe("canMarkShipped", () => {
  it("is offered from every stage before shipped, including the sewing hand-off", () => {
    for (const stage of ["printed", "heatpress", "qc", "to_sewing", "from_sewing"]) {
      expect(canMarkShipped(rows(stage)), stage).toBe(true);
    }
  });

  it("is hidden for a single packed file - Pass to Shipped covers it", () => {
    expect(canMarkShipped(rows("packed"))).toBe(false);
    expect(canMarkShipped(rows("packed", "packed"))).toBe(false);
  });

  it("is offered for a mix that includes packed", () => {
    expect(canMarkShipped(rows("packed", "qc"))).toBe(true);
  });

  it("is refused when any row is already shipped", () => {
    expect(canMarkShipped(rows("qc", "shipped"))).toBe(false);
    expect(canMarkShipped(rows("shipped"))).toBe(false);
  });

  it("is refused for the legacy off-pipeline stages", () => {
    expect(canMarkShipped(rows("rejected"))).toBe(false);
    expect(canMarkShipped(rows("overridden", "qc"))).toBe(false);
  });

  it("is refused for no rows and for a missing row", () => {
    expect(canMarkShipped([])).toBe(false);
    expect(canMarkShipped([undefined])).toBe(false);
  });

  it("the list of source stages never contains shipped", () => {
    expect(MARK_SHIPPED_FROM).not.toContain(PRODUCTION_STAGE.SHIPPED);
  });
});
