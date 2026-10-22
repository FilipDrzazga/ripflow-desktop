import { describe, it, expect } from "vitest";
import { etsyShipByOf, ETSY_SHIP_BY_MAX } from "./etsyShipBy.js";

// What counts as Etsy's ship-by date (plan ETA): whole seconds above 0 and below the milliseconds line. Everything
// else is null = "nothing usable", which the import never turns into a cleared date.
describe("etsyShipByOf", () => {
  it("takes a whole number of seconds above 0", () => {
    expect(etsyShipByOf(1761523200)).toBe(1761523200);
    expect(etsyShipByOf(1)).toBe(1);
    expect(etsyShipByOf(ETSY_SHIP_BY_MAX - 1)).toBe(ETSY_SHIP_BY_MAX - 1);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -1761523200],
    ["a fraction", 1761523200.5],
    ["a string of digits", "1761523200"],
    ["text", "abc"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["milliseconds", 1761523200000],
    ["the bound itself", ETSY_SHIP_BY_MAX],
  ])("refuses %s", (_label, value) => {
    expect(etsyShipByOf(value)).toBeNull();
  });
});
