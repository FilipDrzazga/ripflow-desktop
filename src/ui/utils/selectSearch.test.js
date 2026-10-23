import { describe, it, expect } from "vitest";
import { filterOptions, searchWords } from "./selectSearch";

const options = [
  { value: "", label: "Fabric from the order" },
  { value: "Recycled Eco Lycra", label: "Recycled Eco Lycra" },
  { value: "Eco Dynamica Lycra", label: "Eco Dynamica Lycra" },
  { value: "Active Eco Lycra", label: "Active Eco Lycra" },
  { value: "Cotton Denim", label: "Cotton Denim" },
  { value: "Neraki Waterproof Canvas FR (Water Repellant)", label: "Neraki Waterproof Canvas FR (Water Repellant)" },
];
const values = (list) => list.map((o) => o.value);

describe("searchWords", () => {
  it("lower-cases and splits on any whitespace, dropping empties", () => {
    expect(searchWords("  Eco   LYCRA\t")).toEqual(["eco", "lycra"]);
  });
  it.each([[""], ["   "], [null], [undefined]])("%j has no words", (query) => {
    expect(searchWords(query)).toEqual([]);
  });
});

describe("filterOptions", () => {
  it("nothing typed leaves every option, the very same list", () => {
    expect(filterOptions(options, "")).toBe(options);
    expect(filterOptions(options, "  ")).toBe(options);
  });

  it("keeps the options whose label has every typed word, in any order and case", () => {
    expect(values(filterOptions(options, "eco lycra"))).toEqual(["Recycled Eco Lycra", "Eco Dynamica Lycra", "Active Eco Lycra"]);
    expect(values(filterOptions(options, "LYCRA ACTIVE"))).toEqual(["Active Eco Lycra"]);
  });

  it("a word is a piece of a word: 'denim' finds Cotton Denim, 'wat' finds both Water words", () => {
    expect(values(filterOptions(options, "denim"))).toEqual(["Cotton Denim"]);
    expect(values(filterOptions(options, "wat"))).toEqual(["Neraki Waterproof Canvas FR (Water Repellant)"]);
  });

  it("matches the LABEL, not the value", () => {
    const odd = [{ value: "S-17", label: "Snood" }];
    expect(values(filterOptions(odd, "snood"))).toEqual(["S-17"]);
    expect(filterOptions(odd, "s-17")).toEqual([]);
  });

  it("a text that matches nothing leaves an empty list", () => {
    expect(filterOptions(options, "velvet")).toEqual([]);
  });

  it("an option without a label never matches a typed word and never throws", () => {
    expect(filterOptions([{ value: "x" }], "a")).toEqual([]);
  });
});
