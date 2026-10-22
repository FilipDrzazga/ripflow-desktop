import { describe, it, expect, vi } from "vitest";

// A RETRY of a line whose order the tick does not LIST (FILIP 2026-10-22: Retry "did nothing" for good) - an order
// older than the start date, brought in by "Import this order", or one Etsy no longer lists as open. The tick
// fetches such an order by its number: open -> only its RETRY lines are judged again; refused -> back to
// NEEDS_REVIEW with Etsy's answer. Same isolation of the parser as etsyImport.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePrintFileName } from "./parseFileName.js";
import { MAX_UNLISTED_RETRY_ORDERS } from "./etsyImport.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const ID = "3456789012";
const KEY = `${ID}:501`;
const open = (transactions, over = {}) => receipt(transactions, { is_paid: true, is_shipped: false, status: "paid", ...over });

// The in-memory table of the kit, with the db.js listRetries over it.
const setup = ({ fetched = null, ...over } = {}) => {
  const getReceipt = vi.fn(async (id) => (typeof fetched === "function" ? fetched(id) : fetched));
  const t = setupImporter({ parse: parsePrintFileName, getReceipt, ...over });
  t.imports.listRetries = () =>
    [...t.imports.rows.values()].filter((r) => r.state === ETSY_IMPORT_STATE.RETRY).map((r) => ({ receiptId: r.receiptId, transactionId: r.transactionId }));
  return { ...t, getReceipt };
};

describe("an order the tick did not list, still paid and open", () => {
  it("is fetched by its number and the RETRY line is imported with the typed number", async () => {
    const t = setup({ fetched: open([lm({ sku: "" })]) });
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    const out = await t.tick();
    expect(t.getReceipt).toHaveBeenCalledWith(ID);
    expect(out).toMatchObject({ ran: true, imported: 1, needsReview: 0 });
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.DONE, manualXwd: "173706" });
    expect(inboxOf(t.disk, "Drill")).toEqual(["ET3456789012_Ann_Lee_1of1_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg"]);
  });

  it("only the RETRY lines go through: a line of the order without a row is not claimed, and the line keeps its place (2of2)", async () => {
    const t = setup({ fetched: open([lm({ transaction_id: 500 }), lm({ transaction_id: 501, sku: "" })]) });
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    const claim = vi.spyOn(t.imports, "claim");
    await t.tick();
    expect(claim).not.toHaveBeenCalled();
    expect(t.imports.rows.has(`${ID}:500`)).toBe(false);
    expect(inboxOf(t.disk, "Drill")).toEqual(["ET3456789012_Ann_Lee_2of2_Drill_3x_Linear Meter - 1m increments_XWD173706_Half-Drop_ETSY.jpg"]);
  });

  it("a line still unreadable goes back to NEEDS_REVIEW with the reason of this look", async () => {
    const t = setup({ fetched: open([lm({ sku: "" })]) });
    t.imports.putRetry();
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ imported: 0, needsReview: 1 });
    const row = t.imports.rows.get(KEY);
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(/No XWD/);
  });
});

describe("an order the tick did not list, refused by Etsy", () => {
  it.each([
    ["shipped", { is_shipped: true }, /already shipped/],
    ["not paid", { is_paid: false }, /not paid/],
    ["cancelled", { status: "Canceled" }, /status "Canceled"/],
  ])("%s: the RETRY line goes back to NEEDS_REVIEW with Etsy's answer, nothing copied", async (_label, over, reason) => {
    const t = setup({ fetched: open([lm()], over) });
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    const out = await t.tick();
    expect(out).toMatchObject({ imported: 0, needsReview: 1 });
    const row = t.imports.rows.get(KEY);
    expect(row.state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(row.reason).toMatch(reason);
    expect(row.manualXwd).toBe("173706");
    expect(t.imports.moves[0]).toMatchObject({ from: [ETSY_IMPORT_STATE.RETRY], state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.disk.calls.copy).toBe(0);
  });

  it("Etsy sends nothing: back to NEEDS_REVIEW, not left waiting", async () => {
    const t = setup({ fetched: null });
    t.imports.putRetry();
    t.setReceipts([]);
    await t.tick();
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason: `Etsy did not send order ET${ID}.` });
  });

  it("a person who dismissed the line meanwhile wins (the move is the guarded one)", async () => {
    const t = setup({ fetched: open([lm()], { is_shipped: true }) });
    t.imports.putRetry();
    t.imports.beforeMove = () => {
      t.imports.rows.get(KEY).state = ETSY_IMPORT_STATE.DISMISSED;
    };
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ needsReview: 0, skipped: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DISMISSED);
  });

  it("a move that cannot be written ends the tick with the reason", async () => {
    const t = setup({ fetched: open([lm()], { is_shipped: true }) });
    t.imports.putRetry();
    t.imports.failMove = true;
    t.setReceipts([]);
    const out = await t.tick();
    expect(out.reason).toMatch(/import table could not be written/);
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
  });
});

describe("what the extra look leaves alone", () => {
  it("an order the tick DID list is not fetched again (its RETRY line is the list's)", async () => {
    const t = setup({ fetched: open([lm()]) });
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([receipt([lm({ sku: "" })])]);
    expect((await t.tick()).imported).toBe(1);
    expect(t.getReceipt).not.toHaveBeenCalled();
  });

  it("an order on the list is never fetched by number; its RETRY line the list no longer carries goes back to NEEDS_REVIEW", async () => {
    const t = setup({ fetched: open([lm()]) });
    t.imports.putRetry({ manualXwd: "173706" }); // line 501
    t.setReceipts([receipt([lm({ transaction_id: 502 })])]); // the listed order, without line 501
    await t.tick();
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(t.getReceipt).not.toHaveBeenCalled();
  });

  it("no RETRY rows: no Etsy call", async () => {
    const t = setup({ fetched: open([lm()]) });
    t.setReceipts([]);
    await t.tick();
    expect(t.getReceipt).not.toHaveBeenCalled();
  });

  it("a table that cannot answer (listRetries null) or has no listRetries: nothing extra, the tick runs", async () => {
    const t = setup({ fetched: open([lm()]) });
    t.imports.putRetry();
    t.imports.listRetries = () => null;
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ ran: true, reason: null });
    delete t.imports.listRetries;
    expect(await t.tick()).toMatchObject({ ran: true, reason: null });
    expect(t.getReceipt).not.toHaveBeenCalled();
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
  });

  it("a closed gate fetches nothing", async () => {
    const t = setup({ fetched: open([lm()]), gate: () => "switched off" });
    t.imports.putRetry();
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ ran: false, reason: "switched off" });
    expect(t.getReceipt).not.toHaveBeenCalled();
  });

  it(`at most ${MAX_UNLISTED_RETRY_ORDERS} orders are fetched in one tick; the rest wait`, async () => {
    const t = setup({ fetched: (id) => open([lm()], { receipt_id: Number(id), is_shipped: true }) });
    for (let i = 0; i < MAX_UNLISTED_RETRY_ORDERS + 2; i += 1) t.imports.putRetry({ receiptId: String(1000 + i) });
    t.setReceipts([]);
    await t.tick();
    expect(t.getReceipt).toHaveBeenCalledTimes(MAX_UNLISTED_RETRY_ORDERS);
    expect([...t.imports.rows.values()].filter((r) => r.state === ETSY_IMPORT_STATE.RETRY)).toHaveLength(2);
  });

  it("the loop hands the engine the db.js list of RETRY lines", () => {
    const loop = readFileSync(fileURLToPath(new URL("../ipc/etsyImportLoop.js", import.meta.url)), "utf8");
    expect(loop).toMatch(/listRetries: listEtsyImportRetries/);
  });

  it("a failed fetch ends the tick with the reason; the line stays RETRY for the next tick", async () => {
    const t = setup({
      fetched: () => {
        throw new Error("Etsy could not be reached");
      },
    });
    t.imports.putRetry();
    t.setReceipts([]);
    const out = await t.tick();
    expect(out.reason).toMatch(/Etsy could not be reached/);
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
  });
});
