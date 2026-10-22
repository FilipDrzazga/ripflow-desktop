import { describe, it, expect } from "vitest";
import { clampEtsyImportMinutes, ETSY_IMPORT_MIN_MINUTES, ETSY_IMPORT_MAX_MINUTES, ETSY_IMPORT_DEFAULT_MINUTES } from "./etsyImportInterval.js";

describe("clampEtsyImportMinutes", () => {
  it("keeps a whole number of minutes in range", () => {
    expect(clampEtsyImportMinutes(2)).toBe(2);
    expect(clampEtsyImportMinutes(5)).toBe(5);
    expect(clampEtsyImportMinutes("10")).toBe(10);
    expect(clampEtsyImportMinutes(60)).toBe(60);
  });

  it("never goes under the floor the Etsy daily limit sets, nor over an hour", () => {
    expect(ETSY_IMPORT_MIN_MINUTES).toBe(2);
    expect(clampEtsyImportMinutes(1)).toBe(2);
    expect(clampEtsyImportMinutes(0)).toBe(2);
    expect(clampEtsyImportMinutes(-5)).toBe(2);
    expect(ETSY_IMPORT_MAX_MINUTES).toBe(60);
    expect(clampEtsyImportMinutes(61)).toBe(60);
    expect(clampEtsyImportMinutes(1e9)).toBe(60);
  });

  it("drops the fraction (minutes, not seconds)", () => {
    expect(clampEtsyImportMinutes(2.9)).toBe(2);
    expect(clampEtsyImportMinutes(7.5)).toBe(7);
  });

  it("anything that is not a number is the default - a store without the key, a typed letter", () => {
    expect(ETSY_IMPORT_DEFAULT_MINUTES).toBe(2);
    expect(clampEtsyImportMinutes(undefined)).toBe(2);
    expect(clampEtsyImportMinutes(null)).toBe(2);
    expect(clampEtsyImportMinutes("")).toBe(2);
    expect(clampEtsyImportMinutes("abc")).toBe(2);
    expect(clampEtsyImportMinutes(NaN)).toBe(2);
  });
});
