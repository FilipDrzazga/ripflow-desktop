import { describe, it, expect } from "vitest";
import { stageFileExt, stageExtToStore, stageFileName, stageFilePath, IMAGE_EXTS } from "./artworkFile.js";

// E3a-2 (W2): the extension of a tracked file comes from file_stages.ext. NULL = pdf; only a member
// of IMAGE_EXTS (compared without case) ever reaches a path, spelled as stored.
describe("stageFileExt", () => {
  it("NULL, undefined and empty are a PDF", () => {
    for (const v of [null, undefined, "", "  ", "."]) expect(stageFileExt(v)).toBe("pdf");
  });

  it("every listed image extension passes, with the case it was stored in", () => {
    for (const ext of IMAGE_EXTS) {
      expect(stageFileExt(ext)).toBe(ext);
      expect(stageFileExt(ext.toUpperCase())).toBe(ext.toUpperCase());
      expect(stageFileExt(`.${ext}`)).toBe(ext);
    }
  });

  it("anything outside the list is a PDF - a path fragment never comes through", () => {
    for (const v of ["pdf", "exe", "png/../x", "..\\x", "png\\x", "bmp", "png.pdf", "p ng"]) {
      expect(stageFileExt(v)).toBe("pdf");
    }
  });
});

describe("stageExtToStore", () => {
  it("is NULL for a PDF and the bare extension for an image", () => {
    expect(stageExtToStore(".pdf")).toBeNull();
    expect(stageExtToStore(undefined)).toBeNull();
    expect(stageExtToStore("junk")).toBeNull();
    expect(stageExtToStore(".PNG")).toBe("PNG");
    expect(stageExtToStore("tif")).toBe("tif");
  });
});

describe("stageFileName / stageFilePath", () => {
  it("builds the PDF name for a row without ext and the image name for one with it", () => {
    const base = { file_id: "ON1_a", batch_path: "C:\\x\\PRINTED\\b" };
    expect(stageFileName(base)).toBe("ON1_a.pdf");
    expect(stageFileName({ ...base, ext: null })).toBe("ON1_a.pdf");
    expect(stageFilePath(base)).toBe("C:\\x\\PRINTED\\b\\ON1_a.pdf");
    expect(stageFileName({ ...base, ext: "PNG" })).toBe("ON1_a.PNG");
    expect(stageFilePath({ ...base, ext: "jpg" })).toBe("C:\\x\\PRINTED\\b\\ON1_a.jpg");
  });
});
