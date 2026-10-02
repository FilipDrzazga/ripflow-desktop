import { describe, it, expect } from "vitest";
import { sameSegments, withLeaving } from "./withLeaving";

const seg = (key, weight = 10) => ({ key, weight, value: weight });
const keys = (list) => list.map((s) => s.key);

describe("withLeaving", () => {
  it("returns the segments untouched when nothing left", () => {
    const next = [seg("a"), seg("b")];
    expect(keys(withLeaving([seg("a"), seg("b")], next))).toEqual(["a", "b"]);
  });

  it("keeps a segment that left at weight 0, right after its old predecessor", () => {
    const merged = withLeaving([seg("a"), seg("b"), seg("c")], [seg("a"), seg("c")]);
    expect(keys(merged)).toEqual(["a", "b", "c"]);
    expect(merged[1]).toMatchObject({ key: "b", weight: 0, value: 0, leaving: true });
  });

  it("keeps a leaving first segment first", () => {
    expect(keys(withLeaving([seg("a"), seg("b")], [seg("b")]))).toEqual(["a", "b"]);
  });

  it("keeps an already-leaving segment leaving while it stays out of the data", () => {
    const first = withLeaving([seg("a"), seg("b")], [seg("a")]);
    const second = withLeaving(first, [seg("a", 20)]);
    expect(second.map((s) => [s.key, !!s.leaving])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("revives a leaving segment that comes back in the data", () => {
    const first = withLeaving([seg("a"), seg("b")], [seg("a")]);
    const back = withLeaving(first, [seg("a"), seg("b", 5)]);
    const revived = back.find((s) => s.key === "b");
    expect(revived.weight).toBe(5);
    expect(revived.leaving).toBeUndefined();
  });
});

describe("sameSegments", () => {
  const full = (over = {}) => ({ key: "a", weight: 10, value: 3, color: "#111", title: "A", breakBefore: false, ...over });

  it("is true for equal content in different arrays and objects", () => {
    expect(sameSegments([full(), full({ key: "b" })], [full(), full({ key: "b" })])).toBe(true);
  });

  it("is true for an empty list against an empty list", () => {
    expect(sameSegments([], [])).toBe(true);
  });

  it("treats a missing breakBefore like false", () => {
    expect(sameSegments([full({ breakBefore: undefined })], [full({ breakBefore: false })])).toBe(true);
  });

  it.each([
    ["key", { key: "z" }],
    ["weight", { weight: 11 }],
    ["value", { value: 4 }],
    ["color", { color: "#222" }],
    ["title", { title: "B" }],
    ["breakBefore", { breakBefore: true }],
  ])("is false when only %s differs", (_name, over) => {
    expect(sameSegments([full()], [full(over)])).toBe(false);
  });

  it("is false when the lengths differ", () => {
    expect(sameSegments([full()], [full(), full({ key: "b" })])).toBe(false);
  });
});
