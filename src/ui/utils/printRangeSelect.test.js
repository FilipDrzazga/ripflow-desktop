import { describe, it, expect } from "vitest";
import { FILE_STATUS } from "../../shared/constants";
import { lockMaterialOf, printSelectBlock, planRangeSelect, describeSkipped, anchorFor } from "./printRangeSelect";

const item = (id, materialType = "Cotton", status = FILE_STATUS.READY) => ({ id, materialType, status });
const set = (...ids) => new Set(ids);
const sorted = (s) => [...s].sort();

// Two groups, drawn top to bottom: a1 a2 a3 | b1 b2 b3 (the range order is the render order).
const groups = () => [
  { printGroup: "A", items: [item("a1"), item("a2"), item("a3")] },
  { printGroup: "B", items: [item("b1"), item("b2"), item("b3")] },
];

const plan = (over) =>
  planRangeSelect({
    groups: groups(),
    heldIds: set(),
    selectedIds: set(),
    heldSelectedIds: set(),
    anchorId: "a1",
    targetId: "b1",
    ...over,
  });

describe("lockMaterialOf", () => {
  it("is the material of the selected rows, null for none", () => {
    const g = [{ items: [item("x", "Cotton"), item("y", "Poly")] }];
    expect(lockMaterialOf(g, set("y"))).toBe("Poly");
    expect(lockMaterialOf(g, set())).toBeNull();
  });
  it("is null when the selection holds two materials (nothing to lock to)", () => {
    const g = [{ items: [item("x", "Cotton"), item("y", "Poly")] }];
    expect(lockMaterialOf(g, set("x", "y"))).toBeNull();
  });
});

describe("printSelectBlock - the one decision of a click and of every range row", () => {
  const heldIds = set("h");
  it("lets a plain row through", () => {
    expect(printSelectBlock(item("x"), { heldIds, lockMaterial: null })).toBeNull();
    expect(printSelectBlock(item("x", "Cotton"), { heldIds, lockMaterial: "Cotton" })).toBeNull();
  });
  it("names the reason a row is refused", () => {
    expect(printSelectBlock(item("h"), { heldIds, lockMaterial: null })).toBe("held");
    expect(printSelectBlock(item("x", "Cotton", FILE_STATUS.INVALID), { heldIds, lockMaterial: null })).toBe("invalid");
    expect(printSelectBlock(item("x", "Poly"), { heldIds, lockMaterial: "Cotton" })).toBe("material");
  });
});

describe("planRangeSelect - not a range", () => {
  it("is null with no anchor", () => {
    expect(plan({ anchorId: null })).toBeNull();
  });
  it("is null when the anchor is the target (a plain toggle)", () => {
    expect(plan({ anchorId: "a2", targetId: "a2" })).toBeNull();
  });
  it("is null when the anchor is no longer in the list", () => {
    expect(plan({ anchorId: "gone" })).toBeNull();
  });
  it("is null across the held / print boundary, both ways", () => {
    expect(plan({ heldIds: set("a3"), selectedIds: set("a1"), anchorId: "a1", targetId: "a3" })).toBeNull();
    expect(plan({ heldIds: set("a1"), heldSelectedIds: set("a1"), anchorId: "a1", targetId: "a3" })).toBeNull();
  });
});

describe("planRangeSelect - print rows", () => {
  it("selects the whole range, across groups, forward", () => {
    const p = plan({ selectedIds: set("a1"), anchorId: "a1", targetId: "b2" });
    expect(sorted(p.selectedIds)).toEqual(["a1", "a2", "a3", "b1", "b2"]);
    expect(p.skipped).toEqual({ held: 0, invalid: 0, material: 0, notHeld: 0 });
  });
  it("selects it backward too", () => {
    const p = plan({ selectedIds: set("b2"), anchorId: "b2", targetId: "a2" });
    expect(sorted(p.selectedIds)).toEqual(["a2", "a3", "b1", "b2"]);
  });
  it("ADDS to what is selected already, it never replaces it", () => {
    const p = plan({ selectedIds: set("a1", "b3"), anchorId: "a1", targetId: "a3" });
    expect(sorted(p.selectedIds)).toEqual(["a1", "a2", "a3", "b3"]);
  });
  it("takes the state of the anchor: a deselected anchor deselects the range", () => {
    const p = plan({ selectedIds: set("a2", "a3", "b1", "b3"), anchorId: "a1", targetId: "b1" });
    expect(sorted(p.selectedIds)).toEqual(["b3"]);
  });
  it("keeps the material lock: rows of another material are skipped and counted", () => {
    const g = groups();
    g[1].items[0] = item("b1", "Poly");
    g[1].items[1] = item("b2", "Poly");
    const p = plan({ groups: g, selectedIds: set("a1"), anchorId: "a1", targetId: "b3" });
    expect(sorted(p.selectedIds)).toEqual(["a1", "a2", "a3", "b3"]);
    expect(p.skipped.material).toBe(2);
  });
  it("skips invalid rows and counts them", () => {
    const g = groups();
    g[0].items[1] = item("a2", "Cotton", FILE_STATUS.INVALID);
    const p = plan({ groups: g, selectedIds: set("a1"), anchorId: "a1", targetId: "a3" });
    expect(sorted(p.selectedIds)).toEqual(["a1", "a3"]);
    expect(p.skipped.invalid).toBe(1);
  });
  it("skips held rows: they never enter selectedIds", () => {
    const p = plan({ heldIds: set("a2", "b1"), selectedIds: set("a1"), anchorId: "a1", targetId: "b2" });
    expect(sorted(p.selectedIds)).toEqual(["a1", "a3", "b2"]);
    expect(p.skipped.held).toBe(2);
    expect(p.heldSelectedIds.size).toBe(0);
  });
  it("deselecting steps over nothing and reports nothing skipped", () => {
    const g = groups();
    g[0].items[1] = item("a2", "Cotton", FILE_STATUS.INVALID);
    const p = plan({ groups: g, heldIds: set("a3"), selectedIds: set("b1"), anchorId: "a1", targetId: "b1" });
    expect(p.selectedIds.size).toBe(0);
    expect(p.skipped).toEqual({ held: 0, invalid: 0, material: 0, notHeld: 0 });
  });
  it("is refused while held rows are selected (one selection at a time) - nothing changes", () => {
    const selected = set("a1");
    const heldSelected = set("h1");
    const p = plan({ heldIds: set("h1"), selectedIds: selected, heldSelectedIds: heldSelected, anchorId: "a1", targetId: "b1" });
    expect(p.selectedIds).toBe(selected);
    expect(p.heldSelectedIds).toBe(heldSelected);
  });
  it("does not touch the input sets", () => {
    const selected = set("a1");
    plan({ selectedIds: selected, anchorId: "a1", targetId: "a3" });
    expect(sorted(selected)).toEqual(["a1"]);
  });
});

describe("planRangeSelect - held rows", () => {
  const heldIds = () => set("a1", "a3", "b2");
  it("selects only the held rows of the range, among held, and leaves selectedIds alone", () => {
    const selected = set();
    const p = plan({ heldIds: heldIds(), selectedIds: selected, heldSelectedIds: set("a1"), anchorId: "a1", targetId: "b2" });
    expect(sorted(p.heldSelectedIds)).toEqual(["a1", "a3", "b2"]);
    expect(p.selectedIds).toBe(selected);
    expect(p.skipped.notHeld).toBe(2); // a2 and b1
  });
  it("takes the state of the anchor: a deselected held anchor deselects the held rows", () => {
    const p = plan({ heldIds: heldIds(), heldSelectedIds: set("a3", "b2"), anchorId: "a1", targetId: "b2" });
    expect(p.heldSelectedIds.size).toBe(0);
    expect(p.skipped.notHeld).toBe(0);
  });
  it("is refused while a print selection exists - nothing joins the held selection", () => {
    const p = plan({ heldIds: heldIds(), selectedIds: set("a2"), heldSelectedIds: set("a1"), anchorId: "a1", targetId: "a3" });
    expect(sorted(p.heldSelectedIds)).toEqual(["a1"]);
  });
  it("never puts a row that is not held into the held selection", () => {
    const p = plan({ heldIds: heldIds(), heldSelectedIds: set("a1"), anchorId: "a1", targetId: "b2" });
    for (const id of p.heldSelectedIds) expect(heldIds().has(id)).toBe(true);
  });
});

describe("describeSkipped / anchorFor", () => {
  it("is null when nothing was skipped, a line otherwise", () => {
    expect(describeSkipped({ held: 0, invalid: 0, material: 0, notHeld: 0 })).toBeNull();
    expect(describeSkipped({ held: 1, invalid: 2, material: 3, notHeld: 0 })).toBe(
      "Skipped 1 on hold, 2 invalid, 3 of another material.",
    );
    expect(describeSkipped({ held: 0, invalid: 0, material: 0, notHeld: 4 })).toBe("Skipped 4 not on hold.");
  });
  it("anchorFor keeps the id while either selection is non-empty and drops it when both are empty", () => {
    expect(anchorFor(set("a"), set(), "x")).toBe("x");
    expect(anchorFor(set(), set("h"), "x")).toBe("x");
    expect(anchorFor(set(), set(), "x")).toBeNull();
  });
});
