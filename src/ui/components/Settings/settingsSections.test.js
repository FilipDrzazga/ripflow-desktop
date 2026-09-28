import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { SECTION_GROUPS, DEFAULT_SECTION, sectionIds } from "./settingsSections.js";

// ETAP 4 (4-ui-nav): the sidebar is only a new ORDER of the same eight sections. Pinned: every
// view Settings.jsx can open is in exactly one group (a section left out of the groups would be
// unreachable), the everyday groups come first and System is the one group at the bottom.

// the VIEWS keys, read from Settings.jsx (a JSX file with view imports the node test cannot load)
const viewKeys = () => {
  const src = readFileSync(fileURLToPath(new URL("./Settings.jsx", import.meta.url)), "utf8");
  const block = src.match(/const VIEWS = \{([\s\S]*?)\};/);
  return [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
};

describe("Settings sections", () => {
  it("every view is in exactly one group, and every section has a view", () => {
    const ids = sectionIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...viewKeys()].sort());
    expect(ids).toHaveLength(8);
  });

  it("Station, then Shop, then System at the bottom", () => {
    expect(SECTION_GROUPS.map((g) => [g.id, g.bottom === true])).toEqual([
      ["station", false],
      ["shop", false],
      ["system", true],
    ]);
    expect(SECTION_GROUPS[0].sections.map((s) => s.id)).toEqual(["general", "paths"]);
    expect(SECTION_GROUPS[1].sections.map((s) => s.id)).toEqual(["fabrics", "rollbackReasons", "shopProfile"]);
    expect(SECTION_GROUPS[2].sections.map((s) => s.id)).toEqual(["updates", "database", "maintenance"]);
  });

  it("opens on General, as before", () => {
    expect(DEFAULT_SECTION).toBe("general");
  });
});
