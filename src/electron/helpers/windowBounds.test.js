import { describe, it, expect } from "vitest";
import {
  fitStartSize,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
} from "./windowBounds.js";

describe("fitStartSize", () => {
  it("keeps the default on a screen that is large enough", () => {
    expect(fitStartSize({ width: 1920, height: 1040 })).toEqual({
      width: WINDOW_DEFAULT_WIDTH,
      height: WINDOW_DEFAULT_HEIGHT,
    });
  });

  it("clamps to the work area of a laptop at 125% scaling (the restored window never exceeds the screen)", () => {
    expect(fitStartSize({ width: 1092, height: 582 })).toEqual({ width: 1092, height: 582 });
  });

  it("never goes below the window minimum, even on a smaller screen", () => {
    expect(fitStartSize({ width: 800, height: 400 })).toEqual({
      width: WINDOW_MIN_WIDTH,
      height: WINDOW_MIN_HEIGHT,
    });
  });

  it("clamps each axis on its own", () => {
    expect(fitStartSize({ width: 2560, height: 600 })).toEqual({ width: WINDOW_DEFAULT_WIDTH, height: 600 });
  });

  it("falls back to the default when the work area is unreadable", () => {
    const def = { width: WINDOW_DEFAULT_WIDTH, height: WINDOW_DEFAULT_HEIGHT };
    expect(fitStartSize(undefined)).toEqual(def);
    expect(fitStartSize({})).toEqual(def);
    expect(fitStartSize({ width: 0, height: NaN })).toEqual(def);
  });

  it("the minimum height is 560 (laptop 1366x768 at 125% is ~582 px usable)", () => {
    expect(WINDOW_MIN_HEIGHT).toBe(560);
    expect(WINDOW_MIN_WIDTH).toBe(960);
  });
});
