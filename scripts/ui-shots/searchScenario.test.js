import { describe, expect, it } from "vitest";
import { folderOf } from "./lib/shotFolders.mjs";

describe("the search scenario's shot ids", () => {
  it("SR-nn shots go to the search folder", () => {
    expect(folderOf("SR-01")).toBe("search");
  });
});
