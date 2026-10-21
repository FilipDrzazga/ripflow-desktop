import { describe, it, expect } from "vitest";
import fs from "fs";

// E3a-2: the places that used to ask for ".pdf" by hand now ask artworkFile.js. They live in files with no
// harness (the watcher, the handlers, Production), so the wiring is pinned by reading the sources (the device of
// pdfReadiness.wiring.test.js). A NEW place that spells ".pdf" again is the regression this exists for.
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const code = (src) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

describe("the main-process file filters", () => {
  const sites = {
    "ipc/peekInbox.js": "isArtworkFileName",
    "ipc/index.js": "isArtworkFileName",
    "ipc/batchHistoryHandlers.js": "isArtworkFileName",
    "ipc/readPrintedFolder.js": "isArtworkFileName",
  };

  for (const [file, name] of Object.entries(sites)) {
    it(`${file} asks ${name} and spells no ".pdf" test of its own`, () => {
      const src = read(`../electron/${file}`);
      expect(src).toContain(`import { ${name} } from "../../shared/artworkFile.js";`);
      expect(code(src)).not.toMatch(/endsWith\(\s*["']\.pdf["']\s*\)/);
      expect(code(src)).not.toMatch(/\\\.pdf\$/);
    });
  }

  it("createBatch copies an image whole and routes by isImageExt", () => {
    const src = read("../electron/ipc/createBatch.js");
    expect(src).toContain('import { isImageExt } from "../../shared/artworkFile.js";');
    expect(src).toContain("copyWhole(entry.sourcePath, tempTargetPath)");
  });

  it("submitBatch hands the extension to insertFileStage (the only writer of file_stages.ext)", () => {
    const src = read("../electron/ipc/submitBatch.js");
    expect(src).toMatch(/ext:\s+path\.parse\(item\.file\.name\)\.ext/);
  });
});

describe("the renderer builds a tracked file's name from the row", () => {
  const files = [
    "../ui/components/Production/Production.jsx",
    "../ui/components/Production/SewingReceive.jsx",
    "../ui/utils/orderSearch.js",
  ];
  for (const rel of files) {
    it(`${rel.split("/").at(-1)} has no hard-coded .pdf`, () => {
      const src = code(read(rel));
      expect(src).not.toMatch(/\.pdf[`"']/);
      expect(src).toMatch(/stageFile(Name|Path)\(/);
    });
  }
});
