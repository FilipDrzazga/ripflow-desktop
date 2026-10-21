import { describe, it, expect } from "vitest";
import { IMAGE_EXTS, REPEAT_TYPES, REPEAT_NONE, isImageExt, repeatTypeOf } from "./artworkFile.js";

describe("isImageExt", () => {
  it.each(IMAGE_EXTS)("%s is an image tile", (ext) => {
    expect(isImageExt(ext)).toBe(true);
  });

  it("takes any case and a leading dot, as path.extname gives it", () => {
    expect(isImageExt(".JPG")).toBe(true);
    expect(isImageExt(" Tif ")).toBe(true);
  });

  it("a PDF is not a tile, nor is anything unknown or empty", () => {
    for (const ext of ["pdf", ".PDF", "xml", "", null, undefined]) expect(isImageExt(ext)).toBe(false);
  });
});

describe("repeatTypeOf", () => {
  it.each(REPEAT_TYPES)("%s maps to itself", (r) => {
    expect(repeatTypeOf(r)).toBe(r);
  });

  it("any case gives the library spelling", () => {
    expect(repeatTypeOf("half-drop")).toBe("Half-Drop");
    expect(repeatTypeOf("HALF-BRICK")).toBe("Half-Brick");
  });

  it("anything else is null - None included, it is the PDF's value, not a repeat in a name", () => {
    for (const t of [REPEAT_NONE, "Half Drop", "Basic2", "", null]) expect(repeatTypeOf(t)).toBeNull();
  });
});
