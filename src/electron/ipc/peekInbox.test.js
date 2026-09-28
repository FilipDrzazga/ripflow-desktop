import { describe, it, expect, vi } from "vitest";

// ETAP 4 (4-inbox): peekInbox - PDF names only, the same ids readFolders gives its items, and a
// failed look answers success:false (never "empty inbox").
vi.mock("../helpers/getRootPath.js", () => ({ getRootPath: () => "C:/root" }));

import { peekInbox } from "./peekInbox.js";

const dirent = (name, dir) => ({ name, isDirectory: () => dir, isFile: () => !dir });
const fakeFs = (tree, failing = new Set()) => ({
  readdir: async (p) => {
    const key = p.replace(/\\/g, "/");
    if (failing.has(key)) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    if (!(key in tree)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return tree[key];
  },
});

describe("peekInbox", () => {
  it("lists folder_file ids of the PDFs in every folder under the root (any case of .pdf)", async () => {
    const fsp = fakeFs({
      "C:/root": [dirent("GROUP-A", true), dirent("notes.txt", false), dirent("GROUP-B", true)],
      "C:/root/GROUP-A": [dirent("a1.pdf", false), dirent("a2.PDF", false), dirent("sub", true), dirent("x.xml", false)],
      "C:/root/GROUP-B": [dirent("b1.pdf", false)],
    });
    expect(await peekInbox({ fsp })).toEqual({ success: true, ids: ["GROUP-A_a1.pdf", "GROUP-A_a2.PDF", "GROUP-B_b1.pdf"] });
  });

  it("a folder that cannot be read is skipped, the rest is still listed", async () => {
    const fsp = fakeFs(
      { "C:/root": [dirent("A", true), dirent("B", true)], "C:/root/B": [dirent("b.pdf", false)] },
      new Set(["C:/root/A"]),
    );
    expect(await peekInbox({ fsp })).toEqual({ success: true, ids: ["B_b.pdf"] });
  });

  it("the root cannot be read: success false - not an empty inbox", async () => {
    const res = await peekInbox({ fsp: fakeFs({}, new Set(["C:/root"])) });
    expect(res.success).toBe(false);
    expect(res).not.toHaveProperty("ids");
  });

  it("no root path (paths not set): success false", async () => {
    const res = await peekInbox({ root: () => { throw new Error("ERR_PATHS_NOT_SET"); } });
    expect(res).toEqual({ success: false, error: "ERR_PATHS_NOT_SET" });
  });
});
