import { describe, it, expect } from "vitest";
import { isFolderName } from "./folderName.js";

// ETAP 2d-2: the one check for folder names coming from the shop profile.
describe("isFolderName", () => {
  it("accepts one plain folder name: letters, digits, _ and -", () => {
    for (const ok of ["AUTOMATION_WORKFLOW_ERROR", "AUTOMATION_WORKFLOW_MINERVA", "hot-1", "A"]) {
      expect(isFolderName(ok)).toBe(true);
    }
  });

  it("refuses anything that could leave storagePath or is not a name at all", () => {
    for (const bad of ["", "..", "a/b", "a\\b", "C:", "a b", "a.b", "..\\x", " A", null, undefined, 7, {}, ["A"]]) {
      expect(isFolderName(bad)).toBe(false);
    }
  });
});
