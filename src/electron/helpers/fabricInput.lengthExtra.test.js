import { describe, it, expect } from "vitest";
import { fabricSaveError, isLengthExtraInput, lengthExtraToStore } from "./fabricInput.js";

const fabric = (extra = {}) => ({ name: "Satin", type: "Polyesters", ...extra });

describe("the length allowance of a fabric", () => {
  it.each([undefined, null, "", 0, 3.5, "4", 100])("%s is accepted", (value) => {
    expect(isLengthExtraInput(value)).toBe(true);
    expect(fabricSaveError(fabric({ lengthExtraPercent: value }), [])).toBeNull();
  });

  it.each([-1, 100.01, "abc", NaN, Infinity, {}, true])("%s is refused with a readable reason", (value) => {
    expect(isLengthExtraInput(value)).toBe(false);
    expect(fabricSaveError(fabric({ lengthExtraPercent: value }), [])).toMatch(/length allowance/);
  });

  it("not sent keeps what is stored; null and empty clear; a number is stored to two decimals", () => {
    expect(lengthExtraToStore(undefined, 4)).toBe(4);
    expect(lengthExtraToStore(undefined, undefined)).toBe(0);
    expect(lengthExtraToStore(null, 4)).toBe(0);
    expect(lengthExtraToStore("", 4)).toBe(0);
    expect(lengthExtraToStore("2.345", 4)).toBe(2.35);
    expect(lengthExtraToStore(0, 4)).toBe(0);
  });
});
