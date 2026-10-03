import { describe, it, expect, vi } from "vitest";
import {
  idsBetween,
  nextSelection,
  anchorAfterSelection,
  dayRowsInRenderOrder,
  visibleFileIds,
  claimShiftMouseDown,
} from "./rangeSelect";

const row = (file_id) => ({ file_id });
const IDS = ["a", "b", "c", "d", "e"];

describe("idsBetween", () => {
  it("returns the ids from anchor to target inclusive, in either direction", () => {
    expect(idsBetween(IDS, "b", "d")).toEqual(["b", "c", "d"]);
    expect(idsBetween(IDS, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("returns null without an anchor or when either end is not in the list", () => {
    expect(idsBetween(IDS, null, "c")).toBeNull();
    expect(idsBetween(IDS, undefined, "c")).toBeNull();
    expect(idsBetween(IDS, "zz", "c")).toBeNull();
    expect(idsBetween(IDS, "b", "zz")).toBeNull();
  });
});

describe("nextSelection", () => {
  const click = (prev, fileId, extra = {}) =>
    [...nextSelection(new Set(prev), { fileId, shiftKey: false, anchorId: null, orderedIds: IDS, ...extra })];

  it("a plain click toggles one card", () => {
    expect(click([], "c")).toEqual(["c"]);
    expect(click(["c"], "c")).toEqual([]);
  });

  it("a shift-click on a selected anchor SELECTS the range and keeps what was selected", () => {
    expect(click(["a", "e"], "c", { shiftKey: true, anchorId: "a" }).sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("a shift-click on a deselected anchor DESELECTS the range (Gmail model)", () => {
    // the anchor "b" was deselected after being clicked: it is not in prev, the rest of the range is
    expect(click(["c", "d", "e"], "d", { shiftKey: true, anchorId: "b" }).sort()).toEqual(["e"]);
  });

  it("the range goes backwards from the anchor too", () => {
    expect(click(["d"], "b", { shiftKey: true, anchorId: "d" }).sort()).toEqual(["b", "c", "d"]);
  });

  it("without a usable anchor a shift-click is a plain toggle", () => {
    expect(click([], "c", { shiftKey: true, anchorId: null })).toEqual(["c"]);
    expect(click(["x"], "c", { shiftKey: true, anchorId: "gone" }).sort()).toEqual(["c", "x"]);
  });

  it("a shift-click on the anchor itself toggles it", () => {
    expect(click(["c"], "c", { shiftKey: true, anchorId: "c" })).toEqual([]);
  });

  it("does not mutate the previous selection", () => {
    const prev = new Set(["a"]);
    nextSelection(prev, { fileId: "c", shiftKey: true, anchorId: "a", orderedIds: IDS });
    expect([...prev]).toEqual(["a"]);
  });
});

describe("anchorAfterSelection", () => {
  it("keeps the anchor while something is selected and drops it with an empty selection", () => {
    expect(anchorAfterSelection(new Set(["a"]), "a")).toBe("a");
    expect(anchorAfterSelection(new Set(), "a")).toBeNull();
  });
});

// Two batches in one day; the flat list (`rows`) is in the order the filter produced, the batch
// layer sorts the batches by folder name descending - so the two layouts draw DIFFERENT orders.
const day = (dayKey, rows, batches) => ({ dayKey, rows: rows.map(row), batches: batches.map(([p, r]) => [p, r.map(row)]) });
const MON = day("03-10-2026", ["a1", "b1", "a2"], [["PRINTED_2-B", ["b1"]], ["PRINTED_1-A", ["a1", "a2"]]]);
const SUN = day("02-10-2026", ["c1", "c2"], [["PRINTED_3-C", ["c1", "c2"]]]);

describe("dayRowsInRenderOrder / visibleFileIds", () => {
  it("Groups on: batch by batch; Groups off (or a stage tab): the flat row list", () => {
    expect(dayRowsInRenderOrder(MON, true).map((r) => r.file_id)).toEqual(["b1", "a1", "a2"]);
    expect(dayRowsInRenderOrder(MON, false).map((r) => r.file_id)).toEqual(["a1", "b1", "a2"]);
  });

  it("follows the day order it is given, so the Stuck tab (oldest day first) ranges oldest first", () => {
    expect(visibleFileIds([MON, SUN], new Set(), true)).toEqual(["b1", "a1", "a2", "c1", "c2"]);
    expect(visibleFileIds([SUN, MON], new Set(), true)).toEqual(["c1", "c2", "b1", "a1", "a2"]);
  });

  it("leaves out collapsed days - their cards are not on screen", () => {
    expect(visibleFileIds([MON, SUN], new Set(["03-10-2026"]), true)).toEqual(["c1", "c2"]);
    expect(visibleFileIds([MON, SUN], new Set(["03-10-2026", "02-10-2026"]), false)).toEqual([]);
  });

  it("a range across days and batches matches what the operator sees", () => {
    const ids = visibleFileIds([MON, SUN], new Set(), true);
    expect(idsBetween(ids, "a1", "c1")).toEqual(["a1", "a2", "c1"]);
    const flat = visibleFileIds([MON, SUN], new Set(), false);
    expect(idsBetween(flat, "a1", "c1")).toEqual(["a1", "b1", "a2", "c1"]);
  });
});

describe("claimShiftMouseDown", () => {
  const fakeEvent = (over = {}) => ({ shiftKey: true, button: 0, preventDefault: vi.fn(), ...over });
  const fakeWin = () => {
    const removeAllRanges = vi.fn();
    return { win: { getSelection: () => ({ removeAllRanges }) }, removeAllRanges };
  };

  it("with Shift: blocks the browser's text-selection extension and clears the old selection", () => {
    const e = fakeEvent();
    const { win, removeAllRanges } = fakeWin();
    expect(claimShiftMouseDown(e, win)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it("without Shift: leaves the event and the selection alone, so text can still be copied", () => {
    const e = fakeEvent({ shiftKey: false });
    const { win, removeAllRanges } = fakeWin();
    expect(claimShiftMouseDown(e, win)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(removeAllRanges).not.toHaveBeenCalled();
  });

  it("only the primary button (a shift + right-click opens the menu as before)", () => {
    const e = fakeEvent({ button: 2 });
    const { win, removeAllRanges } = fakeWin();
    expect(claimShiftMouseDown(e, win)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(removeAllRanges).not.toHaveBeenCalled();
  });

  it("survives a window without a selection API", () => {
    expect(claimShiftMouseDown(fakeEvent(), {})).toBe(true);
    expect(claimShiftMouseDown(fakeEvent(), undefined)).toBe(true);
  });
});
