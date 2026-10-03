import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// DataList has no UI test harness (no jsdom, no component tests in the repo), so the shift-click
// wiring that lives in the .jsx is pinned here by reading the source - the same way
// Production/rangeSelectWiring.test.js does. The range logic itself is tested in
// utils/printRangeSelect.test.js and store/printRangeSelect.store.test.js; only these lines
// connect it to a click.

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const dataList = read("./DataList.jsx");
const store = read("../../store/useStore.jsx");

describe("shift-click wiring in DataList", () => {
  it("the row checkbox forwards the shift state of the click (without it a shift-click is a plain toggle)", () => {
    expect(dataList).toContain("selectPrintRow(item.id, { shiftKey: e.nativeEvent.shiftKey === true })");
  });

  it("held and print rows go through the one handler, and no second toggle path survives", () => {
    expect(dataList).toContain("onChange={(e) => handleItemCheckboxChange(e, item)}");
    expect(dataList).not.toContain("toggleHeldSelection");
    expect(dataList).not.toContain("toggleItemSelection(");
  });

  it("a shift mousedown on the row label is claimed (without it the text selection stretches across rows)", () => {
    expect(dataList).toContain("onMouseDown={(e) => claimShiftMouseDown(e, window)}");
  });

  it("a range that stepped over rows is reported once, through notify() (rule 5)", () => {
    expect(dataList).toContain("const detail = skipped ? describeSkipped(skipped) : null;");
    expect(dataList).toContain('if (detail) notify({ type: "Info", title: "Range selected", message: detail });');
  });
});

describe("the store keeps the anchor and the gates in one place", () => {
  it("a single click uses the same decision as a range row (printSelectBlock)", () => {
    expect(store).toContain("if (printSelectBlock(clickedItem, { heldIds: state.heldIds, lockMaterial })) return state;");
  });

  it("a plain click still goes through the single-click toggles", () => {
    expect(store).toContain("if (isHeld) get().toggleHeldSelection(id);");
    expect(store).toContain("else get().toggleItemSelection(id);");
  });

  it("the anchor is cleared by one subscriber whenever both selections are empty", () => {
    expect(store).toContain("(state) => state.selectedIds.size + state.heldSelectedIds.size === 0,");
    expect(store).toContain("useStore.setState({ selectionAnchorId: null })");
  });
});
