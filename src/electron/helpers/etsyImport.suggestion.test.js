import { describe, it, expect, vi } from "vitest";

// E4c: a line that stops for want of an XWD number is recorded with the number its listing title points to in the
// library (a hint for the Inbox bar), and the hint is never used to name or copy a file. Same isolation of the
// parser and the same harness as etsyImport.retry.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { LIBRARY, setupImporter, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
// The testkit library holds "ROSE XWD173706_designer_..." and "TULIP XWD204411_designer_...".
const ROSE_TITLE = "Rose fabric by designer - Cotton/ Polyester";

// The details every claim / move of the importer carried, in order.
const setup = () => {
  const t = setupImporter({ parse: parsePrintFileName });
  const written = [];
  const claim = t.imports.claim;
  const move = t.imports.move;
  t.imports.claim = (args) => {
    written.push({ via: "claim", state: args.state, details: args.details });
    return claim(args);
  };
  t.imports.move = (args) => {
    written.push({ via: "move", state: args.state, details: args.details });
    return move(args);
  };
  return { ...t, written };
};

describe("a line without an XWD number", () => {
  it("is recorded with the library number its title points to - and nothing is copied for it", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ needsReview: 1, imported: 0, failed: 0 });
    expect(t.written).toEqual([{ via: "claim", state: ETSY_IMPORT_STATE.NEEDS_REVIEW, details: expect.objectContaining({ suggestedXwd: "173706", title: ROSE_TITLE }) }]);
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, fileName: null });
    expect(inboxOf(t.disk, "Drill")).toEqual([]);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("gets no suggestion when the title does not point to ONE library number", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "", title: "Rose fabric by somebody else" })])]);
    await t.tick();
    expect(t.written[0].details.suggestedXwd).toBeNull();
  });

  it("is still recorded when the library cannot be read - the suggestion is lost, the line is not", async () => {
    const t = setup();
    t.disk.folders.delete(LIBRARY);
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ ran: true, needsReview: 1 });
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.written[0].details.suggestedXwd).toBeNull();
  });
});

describe("a line whose number has no image in the library", () => {
  it("is recorded with the number its title points to", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "XWD999999", title: ROSE_TITLE })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ needsReview: 1 });
    expect(t.imports.rows.get(KEY).reason).toMatch(/No image with XWD999999/);
    expect(t.written[0].details.suggestedXwd).toBe("173706");
  });
});

describe("a line that stops for another reason", () => {
  it("carries no suggestion, however well the title matches", async () => {
    const t = setup();
    const noFabric = lm({ title: ROSE_TITLE, variations: [{ formatted_name: "Size", formatted_value: "Linear Meter - 1m increments" }] });
    t.setReceipts([receipt([noFabric])]);
    await t.tick();
    expect(t.imports.rows.get(KEY).reason).toMatch(/no "Fabric" variation/);
    expect(t.written[0].details.suggestedXwd).toBeNull();
  });
});

describe("a Retry that stops at the number again", () => {
  it("writes the suggestion with the move back to needs_review", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "999999" });
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.written).toEqual([{ via: "move", state: ETSY_IMPORT_STATE.NEEDS_REVIEW, details: expect.objectContaining({ suggestedXwd: "173706" }) }]);
  });

  it("clears an old suggestion when the new stop is not about the number", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE, quantity: 0 })])]);
    await t.tick();
    expect(t.imports.rows.get(KEY).reason).toMatch(/quantity/);
    expect(t.written[0].details.suggestedXwd).toBeNull();
  });

  it("a Retry that imports says nothing about the suggestion", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([receipt([lm({ sku: "", title: ROSE_TITLE })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1 });
    expect(Object.hasOwn(t.written[0].details, "suggestedXwd")).toBe(false);
  });
});
