import { describe, it, expect } from "vitest";
import { estimatePrintLength, estimateMaterialLengthByGroups } from "./estimatePrintLength.js";
import { LM_ROLL_POLY, LM_ROLL_COTTON_DEFAULT, MARGIN_COTTON, MARGIN_POLY } from "./printWidths.js";

// Helper to build a minimal file object
const makeFile = (overrides = {}) => ({
  printTypeCode: "LM",
  materialType: "Cottons",
  material: "Poplin",
  width: 500,
  height: 1000,
  qty: 1,
  variant: null,
  ...overrides,
});

describe("estimatePrintLength", () => {
  it("returns zero for empty input", () => {
    const result = estimatePrintLength([]);
    expect(result.totalLengthMm).toBe(0);
    expect(result.fixedTotalLengthM).toBe(0);
    expect(result.rowsCount).toBe(0);
  });

  it("skips files with non-finite dimensions", () => {
    const result = estimatePrintLength([
      makeFile({ width: NaN }),
      makeFile({ height: Infinity }),
      makeFile({ qty: 0, printTypeCode: "FQ" }),
    ]);
    expect(result.totalLengthMm).toBe(0);
  });

  it("single cotton LM file — correct height with margin", () => {
    const height = 800;
    const result = estimatePrintLength([makeFile({ height, width: 400 })]);
    // LM uses qty=1; height + MARGIN_COTTON
    expect(result.totalLengthMm).toBe(height + MARGIN_COTTON);
    expect(result.rowsCount).toBe(1);
  });

  it("single poly file uses MARGIN_POLY and LM_ROLL_POLY", () => {
    const height = 600;
    const result = estimatePrintLength([
      makeFile({ materialType: "Polyesters", material: "", height, width: 400 }),
    ]);
    expect(result.totalLengthMm).toBe(height + MARGIN_POLY);
  });

  it("two cotton files fitting side-by-side in one row", () => {
    // Roll = 1420mm, each file width 500mm → both fit (500+500=1000 ≤ 1420)
    const height = 1000;
    const files = [
      makeFile({ width: 500, height }),
      makeFile({ width: 500, height }),
    ];
    const result = estimatePrintLength(files);
    // Both in one row → length = height + margin once
    expect(result.totalLengthMm).toBe(height + MARGIN_COTTON);
    expect(result.rowsCount).toBe(1);
  });

  it("two cotton files too wide for one row → two rows", () => {
    // Roll = 1420mm, each file width 800mm → won't fit together (800+800=1600 > 1420)
    const height = 1000;
    const files = [
      makeFile({ width: 800, height }),
      makeFile({ width: 800, height }),
    ];
    const result = estimatePrintLength(files);
    expect(result.totalLengthMm).toBe((height + MARGIN_COTTON) * 2);
    expect(result.rowsCount).toBe(2);
  });

  it("LM printTypeCode always uses qty=1 regardless of file.qty", () => {
    const result = estimatePrintLength([makeFile({ printTypeCode: "LM", qty: 5, width: 500, height: 1000 })]);
    // qty forced to 1 for LM
    expect(result.rowsCount).toBe(1);
  });

  it("non-LM respects qty — expands to multiple items", () => {
    // qty=3, each 500mm wide on 1420mm roll
    // 3 × 500 = 1500 > 1420 → at least 2 rows
    const result = estimatePrintLength([
      makeFile({ printTypeCode: "FQ", qty: 3, width: 500, height: 600 }),
    ]);
    expect(result.rowsCount).toBeGreaterThanOrEqual(2);
  });

  it("CUSHION with 'both sides' doubles the quantity", () => {
    const single = estimatePrintLength([
      makeFile({ printTypeCode: "CUSHION", qty: 1, variant: null, width: 400, height: 400 }),
    ]);
    const bothSides = estimatePrintLength([
      makeFile({ printTypeCode: "CUSHION", qty: 1, variant: "Both sides print", width: 400, height: 400 }),
    ]);
    // Both sides → qty 2 → more rows or same row depending on widths
    expect(bothSides.totalLengthMm).toBeGreaterThanOrEqual(single.totalLengthMm);
  });

  it("uses per-material roll width for cotton", () => {
    // 'Melino Linen' has roll width 1420 in LM_ROLL_COTTON — same as default here, just verifying no crash
    const result = estimatePrintLength([
      makeFile({ material: "Melino Linen", width: 400, height: 500 }),
    ]);
    expect(result.totalLengthMm).toBeGreaterThan(0);
  });

  it("poly roll width is LM_ROLL_POLY (1550) — wider than cotton", () => {
    // Fill exactly 1420mm wide on poly roll — should all fit in one row
    const result = estimatePrintLength([
      makeFile({ materialType: "Polyesters", material: "", width: 700, height: 500 }),
      makeFile({ materialType: "Polyesters", material: "", width: 700, height: 500 }),
    ]);
    // 700+700=1400 ≤ 1550 → one row
    expect(result.rowsCount).toBe(1);
  });

  it("fixedTotalLengthM rounds to 2 decimal places", () => {
    const result = estimatePrintLength([makeFile({ height: 333, width: 400 })]);
    const decimals = result.fixedTotalLengthM.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

describe("estimateMaterialLengthByGroups", () => {
  it("returns 0 for empty groups", () => {
    expect(estimateMaterialLengthByGroups([], "Cottons")).toBe(0);
    expect(estimateMaterialLengthByGroups(null, "Cottons")).toBe(0);
  });

  it("sums only items matching the given materialType", () => {
    const groups = [
      {
        items: [
          makeFile({ materialType: "Cottons", width: 400, height: 1000 }),
          makeFile({ materialType: "Polyesters", material: "", width: 400, height: 2000 }),
        ],
      },
    ];
    const cottons = estimateMaterialLengthByGroups(groups, "Cottons");
    const poly = estimateMaterialLengthByGroups(groups, "Polyesters");
    expect(cottons).toBeGreaterThan(0);
    expect(poly).toBeGreaterThan(cottons); // poly item is twice as tall
  });

  it("skips groups with no items of requested material", () => {
    const groups = [
      { items: [makeFile({ materialType: "Polyesters", material: "" })] },
    ];
    expect(estimateMaterialLengthByGroups(groups, "Cottons")).toBe(0);
  });
});
