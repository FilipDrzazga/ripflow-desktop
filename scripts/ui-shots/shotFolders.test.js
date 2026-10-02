import { describe, expect, it } from "vitest";
import { folderOf } from "./lib/shotFolders.mjs";

describe("folderOf", () => {
  it("maps every catalogue prefix to a folder", () => {
    const prefixes = ["GL", "PR", "BH", "PD", "RL", "CO", "AN", "LG", "ST", "WZ"];
    const folders = prefixes.map((p) => folderOf(`${p}-01`));
    expect(new Set(folders).size).toBe(prefixes.length);
  });

  it("refuses an id the catalogue does not know, so a typo cannot create a stray folder", () => {
    expect(() => folderOf("XX-01")).toThrow(/no folder/);
  });
});
