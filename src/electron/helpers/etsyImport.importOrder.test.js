import { describe, it, expect, vi } from "vitest";

// "Import this order" (plan E5): ONE receipt a person named, through the tick's own lines. Same isolation of the
// parser as etsyImport.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import path from "node:path";
import { parsePrintFileName } from "./parseFileName.js";
import { oneOffRefusal } from "./etsyImport.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf, STORAGE } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const ID = "3456789012";
// A receipt as getShopReceipt sends it for a paid order that waits for shipping.
const open = (transactions, over = {}) => receipt(transactions, { is_paid: true, is_shipped: false, status: "paid", ...over });

const setup = ({ fetched, ...over } = {}) => {
  const getReceipt = vi.fn(async () => fetched);
  const gate = vi.fn(() => null);
  const t = setupImporter({ parse: parsePrintFileName, getReceipt, gate, ...over });
  return { ...t, getReceipt, gate: over.gate ?? gate };
};

describe("importReceipt - the gate", () => {
  it("asks the tick's gate WITHOUT the start date; the tick itself still asks it with", async () => {
    const t = setup({ fetched: open([lm()]) });
    await t.tick.importReceipt(ID);
    expect(t.gate).toHaveBeenLastCalledWith({ anyStartDate: true });
    await t.tick();
    expect(t.gate).toHaveBeenLastCalledWith();
  });

  it("a closed gate (not the importer station) does nothing: no Etsy call, no row, no file", async () => {
    const t = setup({ fetched: open([lm()]), gate: () => "this station is not switched on as the Etsy importer (Settings > Etsy)" });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: false, imported: 0, reason: expect.stringContaining("not switched on") });
    expect(t.getReceipt).not.toHaveBeenCalled();
    expect(t.imports.rows.size).toBe(0);
    expect(t.disk.calls.copy).toBe(0);
  });
});

describe("importReceipt - the order is fetched again and must be paid and open", () => {
  it("fetches the receipt by the number it was given and never lists the open orders", async () => {
    const listReceipts = vi.fn(async () => []);
    const t = setup({ fetched: open([lm()]), listReceipts });
    await t.tick.importReceipt(ID);
    expect(t.getReceipt).toHaveBeenCalledWith(ID);
    expect(listReceipts).not.toHaveBeenCalled();
  });

  it.each([
    ["shipped", { is_shipped: true, status: "completed" }, "already shipped"],
    ["shipped flag missing", { is_shipped: undefined }, "already shipped"],
    ["not paid", { is_paid: false, status: "payment processing" }, "not paid"],
    ["cancelled", { status: "canceled" }, "canceled"],
    ["an unknown status", { status: "fully refunded" }, "fully refunded"],
    ["another order than the one asked for", { receipt_id: 999 }, "did not send"],
  ])("%s -> refused, nothing written or copied", async (_label, over, words) => {
    const t = setup({ fetched: open([lm()], over) });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: false, imported: 0, needsReview: 0 });
    expect(out.reason).toContain(words);
    expect(t.imports.rows.size).toBe(0);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("Etsy did not answer -> stopped with its message, nothing written", async () => {
    const t = setup({ getReceipt: vi.fn(async () => Promise.reject(new Error("Etsy answered 404"))) });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: false, reason: "Etsy import stopped: Etsy answered 404" });
    expect(t.imports.rows.size).toBe(0);
  });
});

describe("importReceipt - the tick's own lines", () => {
  it("imports the line: claim -> copy -> DONE, the file in the inbox folder of its fabric", async () => {
    const t = setup({ fetched: open([lm()]) });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: true, reason: null, imported: 1, needsReview: 0, failed: 0, skipped: 0 });
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE });
    expect(inboxOf(t.disk, "Drill")).toEqual([t.imports.rows.get(KEY).fileName]);
  });

  it("a line it cannot read goes to the Etsy bar (NEEDS_REVIEW), like in the tick", async () => {
    const t = setup({ fetched: open([lm({ sku: "", title: "Rose fabric" })]) });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: true, imported: 0, needsReview: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
  });

  it("a line that already has a row is never copied a second time - pressed twice, one file", async () => {
    const t = setup({ fetched: open([lm()]) });
    await t.tick.importReceipt(ID);
    const second = await t.tick.importReceipt(ID);
    expect(second).toMatchObject({ ran: true, imported: 0, skipped: 1 });
    expect(t.disk.calls.copy).toBe(1);
    expect(inboxOf(t.disk, "Drill")).toHaveLength(1);
  });

  it("a line the tick already imported (DONE, file gone to a batch) is not imported again", async () => {
    const t = setup({ fetched: open([lm()]) });
    t.setReceipts([open([lm()])]);
    await t.tick();
    for (const p of [...t.disk.files.keys()].filter((f) => path.dirname(f) === path.join(STORAGE, "Drill"))) t.disk.files.delete(p);
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ imported: 0, skipped: 1 });
    expect(inboxOf(t.disk, "Drill")).toHaveLength(0);
  });

  it("a RETRY row of this order is acted on by the same retry path as the tick", async () => {
    const t = setup({ fetched: open([lm({ sku: "", title: "Rose fabric" })]) });
    t.imports.putRetry({ manualXwd: "173706" });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ ran: true, imported: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
  });

  it("every line of the order, each with its own row and file", async () => {
    const t = setup({ fetched: open([lm(), lm({ transaction_id: 502, quantity: 1 })]) });
    const out = await t.tick.importReceipt(ID);
    expect(out).toMatchObject({ imported: 2 });
    expect(inboxOf(t.disk, "Drill")).toHaveLength(2);
    expect(t.imports.rows.get("3456789012:502").state).toBe(ETSY_IMPORT_STATE.DONE);
  });
});

describe("oneOffRefusal", () => {
  const ok = { receipt_id: 3456789012, is_paid: true, is_shipped: false, status: "Paid" };
  it("a paid order that waits for shipping is taken (status read without case)", () => {
    expect(oneOffRefusal(ok, ID)).toBeNull();
  });
  it("no receipt at all is refused", () => {
    expect(oneOffRefusal(null, ID)).toMatch(/did not send order ET3456789012/);
  });
  it("a paid flag that is not a boolean true is refused", () => {
    expect(oneOffRefusal({ ...ok, is_paid: "true" }, ID)).toMatch(/not paid/);
  });
  it("a status Etsy did not send is refused", () => {
    expect(oneOffRefusal({ ...ok, status: undefined }, ID)).toMatch(/status "unknown"/);
  });
});
