import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB edge only, exactly as fabricCache.test.js and shopProfile.test.js do: the
// cache under test is the real one. A mutable behaviour lets one suite exercise a loaded
// catalogue, an empty one, and a database that cannot be read at all.
let fabricsBehaviour = () => [];
let globalsBehaviour = () => ({});

vi.mock("./db.js", () => ({
  getAllFabrics: () => fabricsBehaviour(),
  getFabricGlobals: () => globalsBehaviour(),
}));

import { loadFabricCache, invalidateFabricCache, getXmlWidthFromCache } from "./fabricCache.js";
import { getMaterialType } from "./getMaterialType.js";

const CATALOGUE = [
  { name: "Cotton Slub", type: "Cottons", xmlWidth: 1420, rollWidth: 1420 },
  { name: "Satin", type: "Cottons", xmlWidth: 1400, rollWidth: 1420 },
  { name: "Luxe Velvet", type: "Polyesters", xmlWidth: 1380, rollWidth: 1550 },
];

// Names lifted from the Sets this cut deleted. They are the whole point of the suite: a
// fabric Alex happens to own must NOT be classified or measured at a shop whose catalogue
// does not list it. If someone reintroduces a built-in list, these are what wake up.
const ALEX_ONLY_COTTON = "Organic Iris Jersey";
const ALEX_ONLY_POLY = "Eco Telis Velvet - Non FR";

const withCatalogue = (rows) => {
  fabricsBehaviour = () => rows;
  globalsBehaviour = () => ({ defaultXmlWidthCotton: 1420, defaultXmlWidthPoly: 1420 });
  invalidateFabricCache();
  loadFabricCache();
};

const withUnreadableDb = () => {
  fabricsBehaviour = () => null; // what db.getAllFabrics answers when there is no handle
  globalsBehaviour = () => null;
  invalidateFabricCache();
  loadFabricCache();
};

beforeEach(() => {
  invalidateFabricCache();
});

describe("getMaterialType — catalogue loaded, fabric known", () => {
  it("returns the class the catalogue stores", () => {
    withCatalogue(CATALOGUE);
    expect(getMaterialType("Cotton Slub")).toBe("Cottons");
    expect(getMaterialType("Luxe Velvet")).toBe("Polyesters");
  });

  it("trims before looking up", () => {
    withCatalogue(CATALOGUE);
    expect(getMaterialType("  Cotton Slub  ")).toBe("Cottons");
  });
});

describe("getMaterialType — catalogue loaded, fabric unknown", () => {
  it("returns Unknown rather than guessing", () => {
    withCatalogue(CATALOGUE);
    expect(getMaterialType("Something Nobody Stocks")).toBe("Unknown");
  });

  // The load-bearing assertion of this cut. Before it, these two names were classified
  // from hardcoded Sets copied out of Alex's catalogue, so a shop that does not stock them
  // still got a class - and with it a printer. A wrong class routes cotton to a polyester
  // machine; "Unknown" only blocks the print.
  it("does not classify a fabric that only Alex's deleted lists knew", () => {
    withCatalogue(CATALOGUE);
    expect(getMaterialType(ALEX_ONLY_COTTON)).toBe("Unknown");
    expect(getMaterialType(ALEX_ONLY_POLY)).toBe("Unknown");
  });

  it("returns Unknown for an empty catalogue", () => {
    withCatalogue([]);
    expect(getMaterialType("Cotton Slub")).toBe("Unknown");
  });
});

describe("getMaterialType — catalogue not loaded", () => {
  it("returns Unknown when the cache was never loaded", () => {
    expect(getMaterialType("Cotton Slub")).toBe("Unknown");
  });

  it("returns Unknown when the database could not be read", () => {
    withUnreadableDb();
    expect(getMaterialType("Cotton Slub")).toBe("Unknown");
    expect(getMaterialType(ALEX_ONLY_POLY)).toBe("Unknown");
  });
});

describe("getMaterialType — bad input", () => {
  it("returns Unknown for empty, whitespace, null and undefined", () => {
    withCatalogue(CATALOGUE);
    for (const bad of ["", "   ", null, undefined]) {
      expect(getMaterialType(bad)).toBe("Unknown");
    }
  });
});

describe("getXmlWidthFromCache — the width follows the same rule", () => {
  it("returns the stored width for a known fabric", () => {
    withCatalogue(CATALOGUE);
    expect(getXmlWidthFromCache("Cotton Slub")).toBe(1420);
    expect(getXmlWidthFromCache("Satin")).toBe(1400);
    expect(getXmlWidthFromCache("Luxe Velvet")).toBe(1380);
  });

  // null, not a class default. A width invented for a fabric nobody catalogued is a number
  // that reaches <Width> in the XML and prints at the wrong size.
  it("returns null for a fabric outside the catalogue", () => {
    withCatalogue(CATALOGUE);
    expect(getXmlWidthFromCache("Something Nobody Stocks")).toBeNull();
    expect(getXmlWidthFromCache(ALEX_ONLY_COTTON)).toBeNull();
    expect(getXmlWidthFromCache(ALEX_ONLY_POLY)).toBeNull();
  });

  it("returns null when the catalogue is not loaded or unreadable", () => {
    expect(getXmlWidthFromCache("Cotton Slub")).toBeNull();
    withUnreadableDb();
    expect(getXmlWidthFromCache("Cotton Slub")).toBeNull();
  });

  // Pins the signature. The second argument used to be an isPoly flag the CALLER derived
  // from Alex's polyester Set; passing anything there must now be inert, or a stale call
  // site would keep steering the answer.
  it("ignores a second argument", () => {
    withCatalogue(CATALOGUE);
    expect(getXmlWidthFromCache("Cotton Slub", true)).toBe(1420);
    expect(getXmlWidthFromCache("Nope", true)).toBeNull();
    expect(getXmlWidthFromCache("Nope", false)).toBeNull();
  });
});

describe("getMaterialType and getXmlWidthFromCache agree", () => {
  // One source, one answer. If a fabric has a class it has a width, and if it has neither
  // it has neither - a split would mean the class came from one place and the width from
  // another, which is the defect this cut removes.
  it("either both answer or neither does", () => {
    withCatalogue(CATALOGUE);
    for (const name of ["Cotton Slub", "Satin", "Luxe Velvet", "Something Nobody Stocks", ALEX_ONLY_POLY]) {
      const known = getMaterialType(name) !== "Unknown";
      const width = getXmlWidthFromCache(name);
      expect(known).toBe(width !== null);
    }
  });
});
