import { describe, it, expect } from "vitest";
import { suggestXwdForTitle } from "./etsySuggestion.js";
import { isImageFileName } from "../../shared/artworkFile.js";

const suggest = (title, names) => suggestXwdForTitle(title, names, isImageFileName);

const LIBRARY = [
  "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg",
  "Baby Elephants with Emerald and Turquoise leaves on white XWD146708_MicklynLeFeuvre_Basic_150_05022020.tif",
  "1970S FLORAL XWD173706_RachaelTaylorStudio_Basic_150_01102020.jpg",
  "ABSTRACT FIELDS - GOLD XWD107076_RuthRobson_Half-Drop_211.67_30052018.tif",
  "notes.txt",
];

describe("suggestXwdForTitle", () => {
  it("names the one library number whose design and designer stand in the listing title", () => {
    expect(suggest("Banana Print fabric by daisyhsteele - fabric - Cotton/ Polyester/ Jersey/ Canvas/ Digital Printed", LIBRARY)).toBe("110328");
    expect(suggest("Baby Elephants with Emerald and Turquoise leaves on white fabric by Micklyn LeFeuvre- fabric", LIBRARY)).toBe("146708");
  });

  it("ignores case, punctuation and the spacing of the designer's name", () => {
    expect(suggest("1970s floral, fabric by Rachael Taylor Studio", LIBRARY)).toBe("173706");
    expect(suggest("abstract fields gold fabric by RUTH ROBSON", LIBRARY)).toBe("107076");
  });

  it("needs the designer as well as the design: a title with only the design name suggests nothing", () => {
    expect(suggest("Banana Print fabric by someone else", LIBRARY)).toBeNull();
    expect(suggest("Banana Print fabric", LIBRARY)).toBeNull();
  });

  it("needs the design as WHOLE words: 'Banana Printing' is not 'Banana Print'", () => {
    expect(suggest("Banana Printing fabric by daisyhsteele", LIBRARY)).toBeNull();
  });

  it("the design must OPEN the title: 'Geometric Fox' is not 'Fox Fabric'", () => {
    const names = ["FOX FABRIC XWD101183_andrea_lauren_Basic_150_01102020.jpg"];
    expect(suggest("Fox Fabric by andrea_lauren", names)).toBe("101183");
    expect(suggest("Geometric Fox Fabric by andrea_lauren", names)).toBeNull();
  });

  it("two different numbers matching the title are an ambiguity, even when one of them has doubled files", () => {
    const names = [
      "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg",
      "BANANA PRINT XWD110999_daisyhsteele_Basic_150_01102021.jpg",
    ];
    expect(suggest("Banana Print fabric by daisyhsteele", names)).toBeNull();
    const doubled = [
      "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg",
      "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020 copy.jpg",
      "BANANA PRINT XWD110999_daisyhsteele_Basic_150_01102021.jpg",
    ];
    expect(suggest("Banana Print fabric by daisyhsteele", doubled)).toBeNull();
  });

  it("a number with more than one image is not suggested - the retry would stop at 'N images carry XWD...'", () => {
    const names = [
      "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg",
      "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020 FF.png",
    ];
    expect(suggest("Banana Print fabric by daisyhsteele", names)).toBeNull();
  });

  it("only images count, only six-digit numbers count, and a design or designer that is too short proves nothing", () => {
    expect(suggest("Banana Print fabric by daisyhsteele", ["BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.pdf"])).toBeNull();
    expect(suggest("Banana Print fabric by daisyhsteele", ["BANANA PRINT XWD11032_daisyhsteele_Basic_150_01102020.jpg"])).toBeNull();
    expect(suggest("Fox fabric by daisyhsteele", ["FOX XWD110328_daisyhsteele_Basic_150_01102020.jpg"])).toBeNull();
    expect(suggest("Banana Print fabric by Jo", ["BANANA PRINT XWD110328_Jo_Basic_150_01102020.jpg"])).toBeNull();
  });

  it("an empty title, an empty library or a non-list answer is no suggestion", () => {
    expect(suggest("", LIBRARY)).toBeNull();
    expect(suggest(undefined, LIBRARY)).toBeNull();
    expect(suggest("Banana Print fabric by daisyhsteele", [])).toBeNull();
    expect(suggest("Banana Print fabric by daisyhsteele", null)).toBeNull();
  });
});
