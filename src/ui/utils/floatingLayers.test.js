import { describe, it, expect } from "vitest";
import { CLOSE_FLOATING_EVENT, closeFloatingLayers } from "./floatingLayers";

describe("closeFloatingLayers (D59)", () => {
  it("fires the one close event on the target, to every listener", () => {
    const target = new EventTarget();
    const seen = [];
    target.addEventListener(CLOSE_FLOATING_EVENT, () => seen.push("menu"));
    target.addEventListener(CLOSE_FLOATING_EVENT, () => seen.push("popover"));
    closeFloatingLayers(target);
    expect(seen).toEqual(["menu", "popover"]);
  });

  it("does nothing for a listener that has been removed", () => {
    const target = new EventTarget();
    let calls = 0;
    const handler = () => calls++;
    target.addEventListener(CLOSE_FLOATING_EVENT, handler);
    target.removeEventListener(CLOSE_FLOATING_EVENT, handler);
    closeFloatingLayers(target);
    expect(calls).toBe(0);
  });
});
