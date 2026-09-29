import { describe, it, expect } from "vitest";
import { selectionPrintLength } from "./selectionPrintLength";
import { applyPrintOverrides } from "./applyPrintOverrides";

// Margin 0 and a 1000 mm roll, so every expected number below is plain arithmetic.
const config = { classes: { Cottons: { margin: 0, defaultRollWidth: 1000 } }, fabrics: [] };

const item = (id, over = {}) => ({
  id,
  width: 400,
  height: 500,
  qty: 1,
  printTypeCode: "FQ",
  materialType: "Cottons",
  material: "Cotton Drill",
  ...over,
});

const files = [
  { group: "A", items: [item("a1"), item("a2", { height: 900 })] },
  { group: "B", items: [item("b1", { height: 300 })] },
];

describe("selectionPrintLength", () => {
  it("is zero with nothing selected", () => {
    expect(selectionPrintLength(files, new Set(), new Map(), config)).toEqual({ meters: 0, selected: 0, unmeasured: 0 });
  });

  it("measures only the selected files", () => {
    // a1 (500) is left out: b1 alone is one 300 mm row
    expect(selectionPrintLength(files, new Set(["b1"]), new Map(), config).meters).toBe(0.3);
  });

  it("nests the WHOLE selection like the batch label, not the sum of its groups", () => {
    // a1 400 + b1 400 fit one 1000 mm row: 500 mm. Per group it would be 500 + 300.
    const res = selectionPrintLength(files, new Set(["a1", "b1"]), new Map(), config);
    expect(res.meters).toBe(0.5);
    expect(res.selected).toBe(2);
  });

  it("applies a manual qty override", () => {
    // qty 3 of a 400 mm file: two in a row (500), the third in a second row (500)
    const overrides = new Map([["a1", { qty: 3 }]]);
    expect(selectionPrintLength(files, new Set(["a1"]), overrides, config).meters).toBe(1);
  });

  it("applies a manual meters override on an LM file", () => {
    const lm = [{ group: "L", items: [item("l1", { printTypeCode: "LM", height: 2000 })] }];
    const overrides = new Map([["l1", { meters: 1.25 }]]);
    expect(selectionPrintLength(lm, new Set(["l1"]), overrides, config).meters).toBe(1.25);
  });

  it("prints an open reprint quantity instead of the parsed one", () => {
    const reprint = [{ group: "R", items: [item("r1", { qty: 5, reprintQty: 1, reprintQtyOriginal: 5 })] }];
    expect(selectionPrintLength(reprint, new Set(["r1"]), new Map(), config).meters).toBe(0.5);
  });

  it("counts the files it could not size instead of hiding them", () => {
    const withBroken = [{ group: "X", items: [item("x1"), item("x2", { width: null }), item("x3", { materialType: "Unknown" })] }];
    const res = selectionPrintLength(withBroken, new Set(["x1", "x2", "x3"]), new Map(), config);
    expect(res.meters).toBe(0.5);
    expect(res.unmeasured).toBe(2);
  });

  it("uses the config it is given (rule 23)", () => {
    // no config: the Cottons constants (margin 10, roll 1420) -> 510 mm, not 500
    expect(selectionPrintLength(files, new Set(["a1"]), new Map(), null).meters).toBe(0.51);
    expect(selectionPrintLength(files, new Set(["a1"]), new Map(), config).meters).toBe(0.5);
  });
});

describe("applyPrintOverrides", () => {
  it("tags a manual override with its provenance", () => {
    const [out] = applyPrintOverrides([item("a1", { qty: 4 })], new Map([["a1", { qty: 2 }]]));
    expect(out).toMatchObject({ qty: 2, qtyOverride: 2, _originalQty: 4, _qtyOverridden: true, _printed: { qty: 2 }, _manual: true });
  });

  it("applies a reprint without any override flag", () => {
    const [out] = applyPrintOverrides([item("a1", { qty: 4, reprintQty: 1, reprintQtyOriginal: 4 })], new Map());
    expect(out).toMatchObject({ qty: 1, _printed: { qty: 1 }, _manual: false, _reprintQty: 1, _reprintOriginal: 4 });
    expect(out._qtyOverridden).toBeUndefined();
  });

  it("leaves a plain file untouched", () => {
    const plain = item("a1");
    expect(applyPrintOverrides([plain], new Map())[0]).toBe(plain);
  });
});
