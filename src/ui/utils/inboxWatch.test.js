import { describe, it, expect } from "vitest";
import { inboxDiff, loadedInboxIds, goneSelectedIds, inboxPillLabel } from "./inboxWatch.js";

// ETAP 4 (4-inbox): the comparison behind "N new files - click to refresh".

const diff = (o) => inboxDiff({ loaded: [], baseline: [], previous: [], current: [], ...o });

describe("inboxDiff", () => {
  it("nothing changed: nothing to say", () => {
    expect(diff({ loaded: ["A_1.pdf"], baseline: ["A_1.pdf"], previous: ["A_1.pdf"], current: ["A_1.pdf"] })).toEqual({ added: [], removed: [] });
  });

  it("a new file counts only when two looks in a row saw it", () => {
    expect(diff({ loaded: ["A_1.pdf"], previous: ["A_1.pdf"], current: ["A_1.pdf", "A_2.pdf"] }).added).toEqual([]);
    expect(diff({ loaded: ["A_1.pdf"], previous: ["A_1.pdf", "A_2.pdf"], current: ["A_1.pdf", "A_2.pdf"] }).added).toEqual(["A_2.pdf"]);
  });

  it("a file the list never shows (in the baseline taken at load) is not new", () => {
    const o = { loaded: ["A_1.pdf"], baseline: ["A_1.pdf", "A_empty.pdf"], previous: ["A_1.pdf", "A_empty.pdf"], current: ["A_1.pdf", "A_empty.pdf"] };
    expect(diff(o).added).toEqual([]);
  });

  it("a file on the list that left the inbox is removed at once (one look is enough)", () => {
    expect(diff({ loaded: ["A_1.pdf", "B_2.pdf"], previous: ["A_1.pdf", "B_2.pdf"], current: ["A_1.pdf"] }).removed).toEqual(["B_2.pdf"]);
  });

  it("answers are sorted and accept arrays or Sets", () => {
    const r = inboxDiff({ loaded: new Set(), baseline: new Set(), previous: new Set(["B", "A"]), current: ["B", "A"] });
    expect(r.added).toEqual(["A", "B"]);
  });
});

describe("helpers", () => {
  it("loadedInboxIds reads the item ids of every group", () => {
    expect(loadedInboxIds([{ items: [{ id: "A_1" }, { id: "A_2" }] }, { items: [{ id: "B_1" }] }])).toEqual(["A_1", "A_2", "B_1"]);
    expect(loadedInboxIds(null)).toEqual([]);
  });

  it("goneSelectedIds: only the selected ones that left", () => {
    expect(goneSelectedIds(["A_1", "B_2"], new Set(["B_2", "C_3"]))).toEqual(["B_2"]);
  });

  it("the pill: new, gone, both, an error, or nothing", () => {
    expect(inboxPillLabel({ added: ["a"] })).toBe("1 new file - click to refresh");
    expect(inboxPillLabel({ added: ["a", "b", "c"] })).toBe("3 new files - click to refresh");
    expect(inboxPillLabel({ removed: ["a", "b"] })).toBe("2 files gone - click to refresh");
    expect(inboxPillLabel({ added: ["a"], removed: ["b"] })).toBe("1 new file · 1 file gone - click to refresh");
    expect(inboxPillLabel({ error: true, added: ["a"] })).toBe("Can't check the inbox");
    expect(inboxPillLabel({})).toBeNull();
  });
});
