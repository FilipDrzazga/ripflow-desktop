import path from "node:path";
import { describe, it, expect, vi } from "vitest";

// The buyer's note in the Etsy import engine (plan MSG): the receipt's message_from_buyer, carried on every line of
// the order - written at the claim and by a RETRY's move, refreshed on a line that already has a row only when Etsy
// sends a USABLE note that differs from the stored one, never cleared, never worth a line, and NEVER in the log (a
// customer's free text - not the note, not the message of an error about writing it). The dry run never writes it.
// Same isolation of the parser and harness as etsyImport.shipBy.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { STORAGE, setupImporter, makeImports, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const NOTE = "SECRET-NOTE please wrap it, it is a gift";
const OTHER = "SECRET-OTHER could you add a card";
const OLD = "2026-10-22T10:00:00Z"; // older than STALE_PENDING_MS against the harness clock (12:00)

const setup = (over = {}) => setupImporter({ parse: parsePrintFileName, ...over });
const withNote = (lines, note, over = {}) => receipt(lines, { message_from_buyer: note, ...over });
const noNoteIn = (logs) => logs.every((m) => !/SECRET/.test(m));

// A row as db.js returns it WITH the column: buyerNote null = no note yet.
const putRow = (t, state, buyerNote, extra = {}) =>
  t.imports.rows.set(KEY, {
    receiptId: "3456789012",
    transactionId: "501",
    state,
    fileName: null,
    folder: null,
    reason: null,
    createdAt: OLD,
    updatedAt: OLD,
    title: "Rose fabric",
    quantity: 3,
    listingId: "1234567890",
    manualXwd: null,
    buyerNote,
    ...extra,
  });

const withSetBuyerNote = (t, impl = () => true) => {
  t.imports.setBuyerNote = vi.fn(impl);
  return t.imports.setBuyerNote;
};

describe("a new line carries the order's note in its claim", () => {
  it("every line of the order, imported or stopped", async () => {
    const logs = [];
    const t = setup({ log: (m) => logs.push(m) });
    const claim = vi.spyOn(t.imports, "claim");
    t.setReceipts([withNote([lm(), lm({ transaction_id: 502, sku: "" })], NOTE)]);
    expect(await t.tick()).toMatchObject({ imported: 1, needsReview: 1 });
    expect(claim).toHaveBeenCalledTimes(2);
    for (const [call] of claim.mock.calls) expect(call.details).toMatchObject({ buyerNote: NOTE });
    expect(logs.length).toBeGreaterThan(0);
    expect(noNoteIn(logs)).toBe(true);
  });
});

describe("a line that already has a row: the note is refreshed only when Etsy sends a different usable one", () => {
  it.each([ETSY_IMPORT_STATE.DONE, ETSY_IMPORT_STATE.NEEDS_REVIEW, ETSY_IMPORT_STATE.FAILED, ETSY_IMPORT_STATE.DISMISSED])(
    "%s: NULL -> the note (backfill), and the line is left as it was",
    async (state) => {
      const t = setup();
      const setBuyerNote = withSetBuyerNote(t);
      putRow(t, state, null);
      t.setReceipts([withNote([lm()], NOTE)]);
      expect(await t.tick()).toMatchObject({ skipped: 1, imported: 0, reason: null });
      expect(setBuyerNote).toHaveBeenCalledWith({ receiptId: "3456789012", transactionId: "501", buyerNote: NOTE });
      expect(t.imports.rows.get(KEY).state).toBe(state);
    },
  );

  it("a different note is written, cleaned", async () => {
    const t = setup();
    const setBuyerNote = withSetBuyerNote(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, NOTE);
    t.setReceipts([withNote([lm()], `  ${OTHER}\r\n`)]);
    await t.tick();
    expect(setBuyerNote).toHaveBeenCalledWith({ receiptId: "3456789012", transactionId: "501", buyerNote: OTHER });
  });

  it("the same note (after cleaning) costs no write", async () => {
    const t = setup();
    const setBuyerNote = withSetBuyerNote(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, NOTE);
    t.setReceipts([withNote([lm()], ` ${NOTE} `)]);
    await t.tick();
    expect(setBuyerNote).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["blank", "  \n "],
    ["a number", 12],
  ])("Etsy's note %s never touches the stored one", async (_label, value) => {
    const t = setup();
    const setBuyerNote = withSetBuyerNote(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, NOTE);
    t.setReceipts([withNote([lm()], value)]);
    await t.tick();
    expect(setBuyerNote).not.toHaveBeenCalled();
  });

  it("a row without the column (no buyerNote key) is not written to", async () => {
    const t = setup();
    const setBuyerNote = withSetBuyerNote(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, undefined);
    delete t.imports.rows.get(KEY).buyerNote;
    t.setReceipts([withNote([lm()], NOTE)]);
    await t.tick();
    expect(setBuyerNote).not.toHaveBeenCalled();
  });

  it("a table without setBuyerNote (an older wiring) imports as before", async () => {
    const t = setup();
    putRow(t, ETSY_IMPORT_STATE.DONE, null);
    t.setReceipts([withNote([lm()], NOTE)]);
    expect(await t.tick()).toMatchObject({ ran: true, reason: null, skipped: 1 });
  });
});

describe("a failed write of the note costs the note, never the line - and the log never quotes it", () => {
  it("setBuyerNote throws (an error that quotes the note): the old PENDING row is still settled, the tick goes on", async () => {
    const logs = [];
    const t = setupImporter({ parse: parsePrintFileName, log: (m) => logs.push(m) });
    withSetBuyerNote(t, () => {
      throw Object.assign(new Error(`constraint failed: ${NOTE}`), { code: "SQLITE_CONSTRAINT" });
    });
    const fileName = "ET3456789012_x.jpg";
    t.disk.files.set(path.join(STORAGE, "Drill", fileName), 10);
    putRow(t, ETSY_IMPORT_STATE.PENDING, null, { fileName, folder: "Drill" });
    t.setReceipts([withNote([lm(), lm({ transaction_id: 502 })], NOTE)]);
    const out = await t.tick();
    expect(out).toMatchObject({ reason: null, imported: 2 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(t.imports.rows.get("3456789012:502").state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(logs.some((m) => /buyer's note could not be written \(SQLITE_CONSTRAINT\)\.$/.test(m))).toBe(true);
    expect(noNoteIn(logs)).toBe(true);
  });

  it("an error without a code is named by its kind, still without its message", async () => {
    const logs = [];
    const t = setupImporter({ parse: parsePrintFileName, log: (m) => logs.push(m) });
    withSetBuyerNote(t, () => {
      throw new TypeError(`bad value ${NOTE}`);
    });
    putRow(t, ETSY_IMPORT_STATE.DONE, null);
    t.setReceipts([withNote([lm()], NOTE)]);
    expect(await t.tick()).toMatchObject({ reason: null, skipped: 1 });
    expect(logs.some((m) => /buyer's note could not be written \(TypeError\)\.$/.test(m))).toBe(true);
    expect(noNoteIn(logs)).toBe(true);
  });

  it("setBuyerNote answers null (could not): logged without the note, the line goes on", async () => {
    const logs = [];
    const t = setupImporter({ parse: parsePrintFileName, log: (m) => logs.push(m) });
    withSetBuyerNote(t, () => null);
    putRow(t, ETSY_IMPORT_STATE.DONE, null);
    t.setReceipts([withNote([lm()], NOTE)]);
    expect(await t.tick()).toMatchObject({ reason: null, skipped: 1 });
    expect(logs.some((m) => /buyer's note could not be written\.$/.test(m))).toBe(true);
    expect(noNoteIn(logs)).toBe(true);
  });
});

describe("a RETRY carries the note in its own move", () => {
  it("RETRY -> PENDING: the move carries the note, setBuyerNote is not asked", async () => {
    const t = setup();
    const setBuyerNote = withSetBuyerNote(t);
    t.imports.putRetry({ manualXwd: "173706" });
    t.imports.rows.get(KEY).buyerNote = null;
    t.setReceipts([withNote([lm({ sku: "" })], NOTE)]);
    expect(await t.tick()).toMatchObject({ imported: 1 });
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.PENDING, details: { buyerNote: NOTE } });
    expect(setBuyerNote).not.toHaveBeenCalled();
  });

  it("RETRY -> NEEDS_REVIEW: the move carries the note, the log does not", async () => {
    const logs = [];
    const t = setup({ log: (m) => logs.push(m) });
    t.imports.putRetry();
    t.setReceipts([withNote([lm({ sku: "" })], NOTE)]);
    expect(await t.tick()).toMatchObject({ needsReview: 1 });
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, details: { buyerNote: NOTE } });
    expect(noNoteIn(logs)).toBe(true);
  });

  it("an order outside the tick's list, fetched by number for its RETRY line: the same move carries the note", async () => {
    const getReceipt = vi.fn(async () => withNote([lm({ sku: "" })], NOTE, { is_paid: true, is_shipped: false, status: "paid" }));
    const t = setup({ getReceipt });
    t.imports.listRetries = () => [{ receiptId: "3456789012", transactionId: "501" }];
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ imported: 1, reason: null });
    expect(getReceipt).toHaveBeenCalledWith("3456789012");
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.PENDING, details: { buyerNote: NOTE } });
  });
});

describe("the dry run writes no note", () => {
  it("a table that could write it is never asked, and nothing is copied", async () => {
    const table = makeImports();
    const setBuyerNote = vi.fn(() => true);
    const t = setupImporter({ parse: parsePrintFileName, imports: { get: table.get, setBuyerNote } });
    putRow({ imports: table }, ETSY_IMPORT_STATE.DONE, null);
    const lines = await t.tick.preview(withNote([lm()], NOTE));
    expect(lines[0]).toMatchObject({ ok: true, recordedState: ETSY_IMPORT_STATE.DONE });
    expect(setBuyerNote).not.toHaveBeenCalled();
    expect(table.rows.get(KEY).buyerNote).toBeNull();
    expect(inboxOf(t.disk, "Drill")).toEqual([]);
  });
});
