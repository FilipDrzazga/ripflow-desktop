import { describe, it, expect, vi } from "vitest";

// The E4 half of the Etsy import engine: RETRY (with and without a number typed in), DISMISSED, the CAS that
// lets a person win over the tick, and the line details every row carries for the Inbox bar. Same isolation
// of the parser as etsyImport.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const setup = (over = {}) => setupImporter({ parse: parsePrintFileName, ...over });

describe("every row the import writes carries the line details (title, quantity, listing id)", () => {
  it("a NEEDS_REVIEW row", async () => {
    const t = setup();
    t.setReceipts([receipt([lm({ sku: "" })])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, title: "Rose fabric", quantity: 3, listingId: "1234567890" });
  });

  it("an imported row", async () => {
    const t = setup();
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE, title: "Rose fabric", quantity: 3, listingId: "1234567890" });
  });
});

describe("RETRY with the number typed in", () => {
  it("imports the line with that number although the line itself carries none", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([receipt([lm({ sku: "", title: "Rose fabric" })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 1, needsReview: 0 });
    expect(inboxOf(t.disk, "Drill")).toEqual(["ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg"]);
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE, reason: null, manualXwd: "173706" });
  });

  it("the typed number wins over the one on the line (a person decided)", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "204411" });
    t.setReceipts([receipt([lm()])]); // the line says XWD173706
    await t.tick();
    const [name] = inboxOf(t.disk, "Drill");
    expect(name).toContain("_XWD204411_Basic_ETSY.png");
  });

  it("goes RETRY -> PENDING by a CAS before the copy, and the copy is the claim-less half (no second claim)", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    const claim = vi.spyOn(t.imports, "claim");
    let stateDuringCopy = null;
    const original = t.disk.fsApi.copyFile;
    t.disk.fsApi.copyFile = async (...args) => {
      stateDuringCopy = t.imports.rows.get(KEY).state;
      return original(...args);
    };
    t.setReceipts([receipt([lm({ sku: "" })])]);
    await t.tick();
    expect(t.imports.moves[0]).toMatchObject({ from: [ETSY_IMPORT_STATE.RETRY], state: ETSY_IMPORT_STATE.PENDING, folder: "Drill" });
    expect(t.imports.moves[0].fileName).toMatch(/^ET3456789012_.*_ETSY\.jpg$/);
    expect(stateDuringCopy).toBe(ETSY_IMPORT_STATE.PENDING);
    expect(claim).not.toHaveBeenCalled();
  });

  it.each([
    ["five digits", "17370"],
    ["seven digits", "1737061"],
    ["letters", "17a706"],
    ["the XWD prefix", "XWD173706"],
  ])("a typed number that is not six digits (%s) goes back to NEEDS_REVIEW with that reason, nothing copied", async (_label, typed) => {
    const t = setup();
    t.imports.putRetry({ manualXwd: typed });
    t.setReceipts([receipt([lm()])]); // the line's own number would import - the typed one must not be ignored
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    const row = t.imports.rows.get(KEY);
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(/typed in .* is not six digits/);
    expect(row.manualXwd).toBe(typed);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a six-digit number with no library file is NEEDS_REVIEW with the NEW reason; manual_xwd stays", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "999999" });
    t.setReceipts([receipt([lm({ sku: "" })])]);
    await t.tick();
    const row = t.imports.rows.get(KEY);
    expect(row).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, manualXwd: "999999" });
    expect(row.reason).toMatch(/No image with XWD999999/);
    expect(t.disk.calls.copy).toBe(0);
  });
});

describe("RETRY without a number", () => {
  it("judges the line again as it is now (the listing or the configuration was fixed)", async () => {
    const t = setup();
    t.imports.putRetry();
    t.setReceipts([receipt([lm()])]); // now carries its XWD
    expect((await t.tick()).imported).toBe(1);
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
  });

  it("a line still unreadable is NEEDS_REVIEW again, with the reason of THIS look", async () => {
    const t = setup();
    t.imports.putRetry({ reason: "an old reason" });
    t.setReceipts([receipt([lm({ sku: "", quantity: 4 })])]);
    await t.tick();
    const row = t.imports.rows.get(KEY);
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(/No XWD/);
    expect(t.imports.moves[0].details).toMatchObject({ quantity: 4 });
  });
});

describe("who acts on a RETRY row, and when", () => {
  it("a RETRY of an order Etsy no longer lists (shipped, cancelled) waits - nothing copied, the row unchanged", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    await t.tick();
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
    expect(t.imports.moves).toEqual([]);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a person who dismissed the line between the read and the CAS wins: the tick copies nothing", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.imports.beforeMove = () => {
      t.imports.rows.get(KEY).state = ETSY_IMPORT_STATE.DISMISSED;
    };
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, skipped: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DISMISSED);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a CAS that cannot be written ends the tick before any copy", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.imports.failMove = true;
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out.reason).toMatch(/could not be written/);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("a RETRY whose target name is already in the inbox is NEEDS_REVIEW (EEXIST), the other file untouched", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    const name = "ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg";
    t.disk.files.set(`C:\\storage\\Drill\\${name}`, 7);
    t.setReceipts([receipt([lm()])]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.imports.rows.get(KEY).reason).toMatch(/already in the inbox folder/);
    expect(t.disk.files.get(`C:\\storage\\Drill\\${name}`)).toBe(7);
  });
});

describe("DISMISSED", () => {
  it("is never looked at again, even when the line has become readable", async () => {
    const t = setup();
    t.imports.putRetry();
    t.imports.rows.get(KEY).state = ETSY_IMPORT_STATE.DISMISSED;
    t.setReceipts([receipt([lm()])]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, skipped: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DISMISSED);
    expect(t.imports.moves).toEqual([]);
    expect(t.disk.calls.copy).toBe(0);
  });
});
