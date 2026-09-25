import { describe, it, expect } from "vitest";
import { isPathSet, missingRequiredPaths, REQUIRED_PATH_KEYS } from "./requiredPaths.js";

// ETAP 2h-3: the one answer to "are the two paths set", used by getRootPath.js (refusal)
// and App.jsx (the startup message). Blank has to mean blank in both.

describe("isPathSet", () => {
  it("accepts a non-blank string", () => {
    expect(isPathSet("O:\\Storage")).toBe(true);
    expect(isPathSet("\\\\server\\share")).toBe(true);
  });

  it("refuses empty and whitespace-only strings - path.join would make them relative", () => {
    expect(isPathSet("")).toBe(false);
    expect(isPathSet("   ")).toBe(false);
  });

  it("refuses anything that is not a string", () => {
    for (const v of [undefined, null, 0, false, {}, []]) expect(isPathSet(v)).toBe(false);
  });
});

describe("missingRequiredPaths", () => {
  it("names the storage and XML paths, nothing else", () => {
    expect(REQUIRED_PATH_KEYS).toEqual(["storagePath", "xmlPath"]);
  });

  it("is empty when both are set", () => {
    expect(missingRequiredPaths({ storagePath: "O:\\a", xmlPath: "O:\\b" })).toEqual([]);
  });

  it("names each blank one", () => {
    expect(missingRequiredPaths({ storagePath: "", xmlPath: "O:\\b" })).toEqual(["storagePath"]);
    expect(missingRequiredPaths({ storagePath: "O:\\a", xmlPath: " " })).toEqual(["xmlPath"]);
    expect(missingRequiredPaths({ storagePath: "", xmlPath: "" })).toEqual(["storagePath", "xmlPath"]);
  });

  // customOrderFolderPath is "" at every shop without custom orders - not required.
  it("does not require the custom order folder", () => {
    expect(missingRequiredPaths({ storagePath: "O:\\a", xmlPath: "O:\\b", customOrderFolderPath: "" })).toEqual([]);
  });

  it("names both when the settings could not be read at all", () => {
    expect(missingRequiredPaths(null)).toEqual(["storagePath", "xmlPath"]);
    expect(missingRequiredPaths(undefined)).toEqual(["storagePath", "xmlPath"]);
  });
});
