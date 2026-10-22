import { describe, it, expect, vi } from "vitest";

// D76: the suggestion carries the library FILE it names (so the bar can show which file the number comes from), at the
// claim, at the move of a Retry, and in the dry run - and the file is as unused as the number: nothing is copied for it.
// Same isolation of the parser and harness as etsyImport.suggestion.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { suggestFromLibrary, suggestXwdForTitle } from "./etsySuggestion.js";
import { isImageFileName } from "../../shared/artworkFile.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { LIB_FILE, makeImports, setupImporter, lm, receipt } from "./etsyImport.testkit.js";

const ROSE_TITLE = "Rose fabric by designer - Cotton/ Polyester";

const setup = () => {
  const t = setupImporter({ parse: parsePrintFileName });
  const written = [];
  const claim = t.imports.claim;
  const move = t.imports.move;
  t.imports.claim = (args) => {
    written.push({ via: "claim", details: args.details });
    return claim(args);
  };
  t.imports.move = (args) => {
    written.push({ via: "move", details: args.details });
    return move(args);
  };
  return { ...t, written };
};

describe("suggestFromLibrary", () => {
  const NAMES = ["BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg", "1970S FLORAL XWD173706_RachaelTaylorStudio_Basic_150_01102020.jpg", "notes.txt"];

  it("names the number AND the one library file it comes from", () => {
    expect(suggestFromLibrary("Banana Print fabric by daisyhsteele", NAMES, isImageFileName)).toEqual({
      xwd: "110328",
      fileName: "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg",
    });
  });

  it("names the file of the number it found, not the first image of the folder", () => {
    expect(suggestFromLibrary("1970s floral fabric by Rachael Taylor Studio", NAMES, isImageFileName)).toEqual({
      xwd: "173706",
      fileName: "1970S FLORAL XWD173706_RachaelTaylorStudio_Basic_150_01102020.jpg",
    });
  });

  it("is null where the number alone is null, and suggestXwdForTitle is exactly its number", () => {
    const twin = [...NAMES, "BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020 copy.jpg"];
    expect(suggestFromLibrary("Banana Print fabric by daisyhsteele", twin, isImageFileName)).toBeNull();
    expect(suggestFromLibrary("Something else by nobody", NAMES, isImageFileName)).toBeNull();
    for (const title of ["Banana Print fabric by daisyhsteele", "1970s floral fabric by Rachael Taylor Studio", "Something else by nobody"]) {
      expect(suggestXwdForTitle(title, NAMES, isImageFileName)).toBe(suggestFromLibrary(title, NAMES, isImageFileName)?.xwd ?? null);
    }
  });
});

describe("the importer", () => {
  it("records the library file with the number at the claim - and copies nothing", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    await t.tick();
    expect(t.written[0].details).toMatchObject({ suggestedXwd: "173706", suggestedFile: LIB_FILE });
    expect(t.disk.calls.copy).toBe(0);
  });

  it("records no file name where there is no suggestion (both null), and for a stop that is not about the number", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "", title: "Rose fabric by somebody else" })])]);
    await t.tick();
    expect(t.written[0].details).toMatchObject({ suggestedXwd: null, suggestedFile: null });
    const u = setup();
    u.setReceipts([receipt([lm({ sku: "XWD173706", title: ROSE_TITLE, quantity: 0 })])]);
    await u.tick();
    expect(u.written[0].details).toMatchObject({ suggestedXwd: null, suggestedFile: null });
  });

  it("a Retry that stops at the number again writes the file with the move", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "999999" });
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    await t.tick();
    expect(t.imports.rows.get("3456789012:501")).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.written).toEqual([{ via: "move", details: expect.objectContaining({ suggestedXwd: "173706", suggestedFile: LIB_FILE }) }]);
  });

  it("an unreadable library loses the suggestion and its file name, not the line", async () => {
    const t = setup();
    t.disk.folders.delete("C:\\library");
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    expect(await t.tick()).toMatchObject({ ran: true, needsReview: 1 });
    expect(t.written[0].details).toMatchObject({ suggestedXwd: null, suggestedFile: null });
  });

  it("the dry run shows the file name beside the number, and writes nothing", async () => {
    const table = makeImports();
    const t = setupImporter({ parse: parsePrintFileName, imports: { get: table.get } });
    const [line] = await t.tick.preview(receipt([lm({ sku: "", title: ROSE_TITLE })]));
    expect(line).toMatchObject({ ok: false, suggestedXwd: "173706", suggestedFile: LIB_FILE });
    const [none] = await t.tick.preview(receipt([lm({ sku: "", title: "Rose fabric by somebody else" })]));
    expect(none).toMatchObject({ suggestedXwd: null, suggestedFile: null });
  });
});
