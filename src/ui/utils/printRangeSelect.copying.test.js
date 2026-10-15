import { describe, it, expect } from "vitest";
import { FILE_STATUS } from "../../shared/constants";
import { printSelectBlock, planRangeSelect, describeSkipped } from "./printRangeSelect";

// A row still being copied never joins the print selection - through the ONE decision, so a click,
// a shift-range and the group checkbox all agree.
const item = (id, status = FILE_STATUS.READY, materialType = "Cotton") => ({ id, materialType, status });
const set = (...ids) => new Set(ids);

describe("printSelectBlock - copying", () => {
  it("names a copying row 'copying'", () => {
    expect(printSelectBlock(item("x", FILE_STATUS.COPYING), { heldIds: set(), lockMaterial: null })).toBe("copying");
  });
  it("a held row is still 'held' first (it is already out of the print selection)", () => {
    expect(printSelectBlock(item("h", FILE_STATUS.COPYING), { heldIds: set("h"), lockMaterial: null })).toBe("held");
  });
});

describe("planRangeSelect - copying rows", () => {
  const groups = [{ printGroup: "A", items: [item("a1"), item("a2", FILE_STATUS.COPYING), item("a3"), item("a4", FILE_STATUS.COPYING)] }];
  const plan = (over) =>
    planRangeSelect({ groups, heldIds: set(), selectedIds: set("a1"), heldSelectedIds: set(), anchorId: "a1", targetId: "a4", ...over });

  it("steps over them and counts them", () => {
    const p = plan();
    expect([...p.selectedIds].sort()).toEqual(["a1", "a3"]);
    expect(p.skipped.copying).toBe(2);
  });
  it("describes them in the toast line", () => {
    expect(describeSkipped(plan().skipped)).toBe("Skipped 2 still copying.");
  });
  it("a range that skips none keeps the four-key shape", () => {
    const clean = planRangeSelect({
      groups: [{ printGroup: "A", items: [item("x1"), item("x2")] }],
      heldIds: set(), selectedIds: set("x1"), heldSelectedIds: set(), anchorId: "x1", targetId: "x2",
    });
    expect(clean.skipped).toEqual({ held: 0, invalid: 0, material: 0, notHeld: 0 });
  });
});
