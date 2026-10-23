import { describe, it, expect } from "vitest";
import { fabricSelectOptions, printTypeSelectOptions } from "./etsyImportBar";

// The options of the two dropdowns of the Inbox bar (components/Select takes { value, label }).

const config = { fabrics: [{ name: "Drill" }, { name: "Active Eco Lycra" }] };

describe("fabricSelectOptions", () => {
  it("offers 'from the order' first while nothing is remembered, then the catalogue in its own order", () => {
    expect(fabricSelectOptions(config)).toEqual([
      { value: "", label: "Fabric from the order" },
      { value: "Drill", label: "Drill" },
      { value: "Active Eco Lycra", label: "Active Eco Lycra" },
    ]);
  });

  it("does not offer 'from the order' once a fabric is remembered - it is replaced by another, not cleared here", () => {
    const options = fabricSelectOptions(config, "Drill", true);
    expect(options.map((o) => o.value)).toEqual(["Drill", "Active Eco Lycra"]);
  });

  it("keeps a remembered fabric the catalogue no longer has, so the dropdown shows what the database holds", () => {
    expect(fabricSelectOptions(config, "Velvet", true).map((o) => o.value)).toEqual(["Velvet", "Drill", "Active Eco Lycra"]);
  });

  it("an unloaded catalogue offers only 'from the order'", () => {
    expect(fabricSelectOptions(null)).toEqual([{ value: "", label: "Fabric from the order" }]);
  });
});

describe("printTypeSelectOptions", () => {
  it("offers 'from the order', Snood and Apron while nothing is remembered", () => {
    expect(printTypeSelectOptions()).toEqual([
      { value: "", label: "Type from the order" },
      { value: "SNOOD", label: "Snood" },
      { value: "APRON", label: "Apron" },
    ]);
  });

  it("only Snood and Apron once a type is remembered", () => {
    expect(printTypeSelectOptions(true).map((o) => o.value)).toEqual(["SNOOD", "APRON"]);
  });
});
