import { describe, it, expect, vi } from "vitest";

// E3a-2 (with the E3b switch on): the inbox peek (the "N new files" baseline) names an image tile the way it names a PDF, so a tile that
// arrives in the inbox is "new" and one that was there at load is "old" - same ids readFolders gives its items.
vi.mock("../helpers/getRootPath.js", () => ({ getRootPath: () => "C:/root" }));
// the switch E3b turns on (helpers/inboxFile.js); the default, off, is inboxImageGate.test.js
vi.mock("../helpers/inboxFile.js", () => ({ inboxSkipsImage: () => false }));

import { peekInbox } from "./peekInbox.js";

const dirent = (name, dir) => ({ name, isDirectory: () => dir, isFile: () => !dir });
const fakeFs = (tree) => ({
  readdir: async (p) => {
    const key = p.replace(/\\/g, "/");
    if (!(key in tree)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return tree[key];
  },
});

describe("peekInbox - image tiles", () => {
  it("lists PDFs and every image extension, and still ignores the rest", async () => {
    const fsp = fakeFs({
      "C:/root": [dirent("ETSY", true)],
      "C:/root/ETSY": [
        dirent("a.pdf", false),
        dirent("b.png", false),
        dirent("c.JPG", false),
        dirent("d.tif", false),
        dirent("e.webp", false),
        dirent("f.gif", false),
        dirent("g.jpeg", false),
        dirent("h.xml", false),
        dirent("i.txt", false),
        dirent("j.png", true),
      ],
    });
    expect(await peekInbox({ fsp })).toEqual({
      success: true,
      ids: ["ETSY_a.pdf", "ETSY_b.png", "ETSY_c.JPG", "ETSY_d.tif", "ETSY_e.webp", "ETSY_f.gif", "ETSY_g.jpeg"],
    });
  });
});
