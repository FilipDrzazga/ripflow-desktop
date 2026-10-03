import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for the Production components (see rangeSelectWiring.test.js): the wiring is pinned by
// reading the source. The pin names the defect it stops.

const production = readFileSync(fileURLToPath(new URL("./Production.jsx", import.meta.url)), "utf8");
const body = production.slice(production.indexOf("const handleMarkShipped = async"), production.indexOf("const shipFiles = async"));

describe("Mark as Shipped leaves the selection", () => {
  it("drops the files that shipped from the selection (a stale 'Ship 0 selected' otherwise)", () => {
    expect(body).toContain("const shippedNow = new Set(appliedIds);");
    expect(body).toContain("if (productionStages[id] && !shippedNow.has(id)) next.add(id);");
  });

  it("does not clear the whole selection (rejected / failed files stay picked for a retry)", () => {
    expect(body).not.toContain("setSelectedFileIds(new Set())");
  });
});
