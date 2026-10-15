import { describe, it, expect } from "vitest";
import { dropdownPlacement, DROPDOWN_MAX_HEIGHT } from "./dropdownPlacement";

const rect = (top, bottom) => ({ top, bottom });

describe("dropdownPlacement", () => {
  it("opens below the trigger with the full height when the window is tall", () => {
    expect(dropdownPlacement(rect(300, 330), 1080)).toEqual({ top: 334, maxHeight: DROPDOWN_MAX_HEIGHT });
  });

  it("opens above the trigger when too little room is left below and more above", () => {
    // 560 px window, trigger at the bottom: 560 - 410 - 4 - 12 = 134 below, 360 - 16 = 344 above
    expect(dropdownPlacement(rect(380, 410), 560)).toEqual({ bottom: 560 - 380 + 4, maxHeight: DROPDOWN_MAX_HEIGHT });
  });

  it("stays below, shortened, when below is the larger side even if it is small", () => {
    // trigger near the top of a low window: 560 - 100 - 16 = 444 below -> full height; a very low window shortens it
    expect(dropdownPlacement(rect(70, 100), 300)).toEqual({ top: 104, maxHeight: 300 - 100 - 4 - 12 });
  });

  it("never returns a negative height", () => {
    const placed = dropdownPlacement(rect(10, 700), 720);
    expect(placed.maxHeight).toBeGreaterThanOrEqual(0);
  });
});
