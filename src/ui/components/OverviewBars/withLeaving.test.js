import { describe, it, expect } from "vitest";
import { withLeaving } from "./withLeaving";

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
