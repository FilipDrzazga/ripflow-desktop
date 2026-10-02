import { describe, it, expect } from "vitest";
import { fabricAddError } from "./fabricInput.js";

// D20: an EDIT that renames a material onto the name of ANOTHER existing material is refused like
// an Add (saveFabric deletes the old name and does INSERT OR REPLACE, so the other row would be
// overwritten silently). An edit that keeps its name, and a rename onto a free name, still pass.
// The Add side (no oldName) is pinned in fabricInput.caseAndDuplicate.test.js.

describe("fabricAddError - rename in an edit (D20)", () => {
  const existing = [{ name: "Poplin" }, { name: "Eco Satin Flow" }, { name: "Organza" }];
  const refusal = (name) => `A material named "${name}" already exists. Edit that one instead, or choose another name.`;

  it("a rename onto another existing material is refused with the Add message", () => {
    expect(fabricAddError("Organza", { name: "Poplin" }, existing)).toBe(refusal("Poplin"));
    expect(fabricAddError("Poplin", { name: "Eco Satin Flow" }, existing)).toBe(refusal("Eco Satin Flow"));
  });

  it("an edit that keeps its name passes - the row is its own", () => {
    expect(fabricAddError("Poplin", { name: "Poplin" }, existing)).toBeNull();
  });

  it("a rename onto a free name passes", () => {
    expect(fabricAddError("Poplin", { name: "Chiffon" }, existing)).toBeNull();
  });

  it("names compare exactly, like the primary key: a case-only rename passes", () => {
    expect(fabricAddError("Poplin", { name: "poplin" }, existing)).toBeNull();
    expect(fabricAddError("Organza", { name: "poplin" }, existing)).toBeNull();
    // two rows that differ only by case are two rows: renaming one onto the other is a collision
    const twins = [{ name: "Poplin" }, { name: "poplin" }];
    expect(fabricAddError("Poplin", { name: "poplin" }, twins)).toBe(refusal("poplin"));
  });

  it("an unreadable catalogue (null) leaves the write to fail by itself", () => {
    expect(fabricAddError("Organza", { name: "Poplin" }, null)).toBeNull();
  });

  it("an empty-string oldName is an Add, not an edit", () => {
    expect(fabricAddError("", { name: "Poplin" }, existing)).toBe(refusal("Poplin"));
  });
});
