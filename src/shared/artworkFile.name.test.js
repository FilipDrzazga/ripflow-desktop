import { describe, it, expect } from "vitest";
import { isArtworkFileName, IMAGE_EXTS } from "./artworkFile.js";

// E3a-2: the one test of "is this a print file" the inbox peek, the folder watcher, the PRINTED readers
// and the rollback / regenerate handlers share.
describe("isArtworkFileName", () => {
  it("accepts a PDF and every image extension, without case", () => {
    expect(isArtworkFileName("ON1_a.pdf")).toBe(true);
    expect(isArtworkFileName("ON1_a.PDF")).toBe(true);
    for (const ext of IMAGE_EXTS) {
      expect(isArtworkFileName(`ET1_tile.${ext}`)).toBe(true);
      expect(isArtworkFileName(`ET1_tile.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it("takes the LAST extension, and a dot inside the name (a DPI like 211.67) is not one", () => {
    expect(isArtworkFileName("a_Basic_211.67_ETSY.png")).toBe(true);
    expect(isArtworkFileName("a_Basic_211.67_ETSY")).toBe(false);
    expect(isArtworkFileName("a.png.xml")).toBe(false);
  });

  it("refuses everything else", () => {
    for (const name of ["_batch_info.json", "PRINTED_1.xml", "a.txt", "a.bmp", "pdf", "", ".lock", null, undefined]) {
      expect(isArtworkFileName(name)).toBe(false);
    }
  });
});
