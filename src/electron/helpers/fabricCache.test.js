import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer so the cache can be loaded with deterministic fixtures
// without pulling in the native better-sqlite3 / electron chain.
const fixtures = [
  { name: "Clean Fabric", type: "Cottons", xmlWidth: 1420, rollWidth: 1420, alias: "Neraki" },
  { name: "Dirty Fabric", type: "Polyesters", xmlWidth: 1420, rollWidth: 1550, alias: "Ner aki (X)" },
  { name: "Null Alias", type: "Cottons", xmlWidth: 1420, rollWidth: 1420, alias: null },
  { name: "Empty Alias", type: "Cottons", xmlWidth: 1420, rollWidth: 1420, alias: "   " },
];

vi.mock("./db.js", () => ({
  getAllFabrics: () => fixtures,
  getFabricGlobals: () => ({}),
}));

import { loadFabricCache, invalidateFabricCache, getAliasFromCache } from "./fabricCache.js";

describe("getAliasFromCache — sanitization at point of use", () => {
  beforeEach(() => {
    invalidateFabricCache();
    loadFabricCache();
  });

  it("returns a clean alias unchanged", () => {
    expect(getAliasFromCache("Clean Fabric")).toBe("Neraki");
  });

  it("strips illegal characters from a dirty alias", () => {
    // spaces and parentheses are illegal in a folder / XML path member
    expect(getAliasFromCache("Dirty Fabric")).toBe("NerakiX");
  });

  it("returns null for a null alias", () => {
    expect(getAliasFromCache("Null Alias")).toBeNull();
  });

  it("returns null when the alias is only whitespace", () => {
    expect(getAliasFromCache("Empty Alias")).toBeNull();
  });

  it("returns null for an unknown material", () => {
    expect(getAliasFromCache("Does Not Exist")).toBeNull();
  });

  it("returns null when the cache is not loaded", () => {
    invalidateFabricCache();
    expect(getAliasFromCache("Clean Fabric")).toBeNull();
  });
});
