import { describe, it, expect } from "vitest";
import { toggleHeldId, pruneHeldSelection, unholdMany } from "./heldSelection";

const heldIds = new Set(["h1", "h2", "h3"]);
const none = new Set();

describe("toggleHeldId", () => {
  it("adds and removes a held file", () => {
    const one = toggleHeldId(none, "h1", { heldIds, selectedIds: none });
    expect([...one]).toEqual(["h1"]);
    expect([...toggleHeldId(one, "h1", { heldIds, selectedIds: none })]).toEqual([]);
  });

  it("refuses a file that is not on hold", () => {
    const sel = new Set(["h1"]);
    expect(toggleHeldId(sel, "p1", { heldIds, selectedIds: none })).toBe(sel);
  });

  it("refuses while files are selected for print", () => {
    expect(toggleHeldId(none, "h1", { heldIds, selectedIds: new Set(["p1"]) })).toBe(none);
  });
});

describe("pruneHeldSelection", () => {
  it("drops files another station has unheld", () => {
    const sel = new Set(["h1", "gone"]);
    expect([...pruneHeldSelection(sel, heldIds)]).toEqual(["h1"]);
  });

  it("keeps the same Set when nothing changed (no store churn)", () => {
    const sel = new Set(["h1", "h2"]);
    expect(pruneHeldSelection(sel, heldIds)).toBe(sel);
  });
});

describe("unholdMany", () => {
  it("counts only { success: true } as released", async () => {
    const answers = { a: { success: true }, b: { success: false }, c: undefined };
    const res = await unholdMany(["a", "b", "c"], async (id) => answers[id]);
    expect(res).toEqual({ done: ["a"], failed: ["b", "c"] });
  });

  it("a throw (timeout) fails that file and the rest still run", async () => {
    const seen = [];
    const res = await unholdMany(["a", "b", "c"], async (id) => {
      seen.push(id);
      if (id === "b") throw new Error("timeout");
      return { success: true };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(res).toEqual({ done: ["a", "c"], failed: ["b"] });
  });
});
