import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { orderIdOf } from "./orderLink.js";
import { searchOrders } from "./orderSearch.js";

// D73: a file with no parsed order number used to take "ET2" out of "Velvet2_..." and "ON1" out of "CUSHION1_...",
// because every fallback matched the digits anywhere in the name. They all go through orderIdFromFileName now (a whole
// "_" token), so the source of each consumer is read to keep a fourth hand-rolled copy from creeping back in.
const SOURCES = [
  "./orderLink.js",
  "./orderSearch.js",
  "../components/DataList/DataList.jsx",
  "../components/BatchHistory/BatchHistory.jsx",
];

describe("the order-number fallback of a file name", () => {
  it("no consumer matches the digits anywhere in a name by hand", () => {
    for (const rel of SOURCES) {
      const code = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(code, rel).not.toMatch(/\(\/\(\?:ON\|ET\)\\d\+\/i\)|\(\/ON\\d\+\/i\)/);
    }
  });

  it("orderIdOf: a name without an order token has no order number", () => {
    expect(orderIdOf(null, "Velvet2_Ann_Lee.pdf")).toBeNull();
    expect(orderIdOf("", "CUSHION1_x.pdf")).toBeNull();
    expect(orderIdOf(undefined, "ON312819_Ann_Lee.pdf")).toBe("ON312819");
  });

  it("the search row of an unparsed inbox file takes the same token rule", () => {
    const row = (name) =>
      searchOrders(name.slice(0, 5), {
        files: [{ id: name, file: { name, ext: "pdf" }, orderId: null, customerName: null, createdAt: null }],
      }).groups.flatMap((g) => g.rows)[0];
    expect(row("Jacket10 Ann.pdf").orderKey).toBeNull();
    expect(row("ON77_Ann.pdf").orderKey).toBe("ON77");
  });
});
