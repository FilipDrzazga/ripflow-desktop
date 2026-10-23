import { describe, it, expect } from "vitest";
import { fabricChoices, rememberedFabricOf } from "./etsyImportBar";

describe("rememberedFabricOf", () => {
  const remembered = { 1351273307: "Active Eco Lycra" };

  it("is the fabric remembered for the line's listing", () => {
    expect(rememberedFabricOf(remembered, { listingId: "1351273307" })).toBe("Active Eco Lycra");
  });

  it.each([
    ["another listing", { listingId: "42" }],
    ["a line without a listing", { listingId: null }],
    ["no row", null],
  ])("is empty for %s", (_label, row) => {
    expect(rememberedFabricOf(remembered, row)).toBe("");
  });

  it.each([[null], [undefined], [{ 1351273307: 5 }]])("is empty when the memory is %j", (memory) => {
    expect(rememberedFabricOf(memory, { listingId: "1351273307" })).toBe("");
  });
});

describe("fabricChoices", () => {
  const config = { fabrics: [{ name: "Drill" }, { name: "Cora Canvas" }, { name: "" }, {}] };

  it("lists the catalogue in its own order, without blank names", () => {
    expect(fabricChoices(config)).toEqual(["Drill", "Cora Canvas"]);
  });

  it("keeps a remembered choice the catalogue no longer has, first", () => {
    expect(fabricChoices(config, "Velvet")).toEqual(["Velvet", "Drill", "Cora Canvas"]);
  });

  it("does not repeat a remembered choice the catalogue has", () => {
    expect(fabricChoices(config, "Drill")).toEqual(["Drill", "Cora Canvas"]);
  });

  it.each([[null], [undefined], [{}], [{ fabrics: null }]])("an unloaded catalogue (%j) offers nothing", (value) => {
    expect(fabricChoices(value)).toEqual([]);
  });
});
