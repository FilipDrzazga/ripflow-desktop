import { describe, it, expect, vi } from "vitest";

// D77: an answer about ONE order fetched for a Retry is a verdict on that order, not on the tick. Etsy's 404 and a
// RETRY line the fetched order no longer carries go back to NEEDS_REVIEW - before, the 404 ended every tick at the
// oldest row (the orders behind it were never fetched) and the missing line held one of the fetches for good.
// D78: the bound of those fetches has ONE source, shared with the pace line of Settings > Etsy.
// Same isolation of the parser as etsyImport.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePrintFileName } from "./parseFileName.js";
import { MAX_UNLISTED_RETRY_ORDERS } from "./etsyImport.js";
import { MAX_UNLISTED_RETRY_ORDERS as SHARED_MAX, ETSY_TICK_MAX_REQUESTS } from "../../shared/etsyImportInterval.js";
import { etsyPaceLine } from "../../ui/utils/etsyView.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const ID = "3456789012";
const KEY = `${ID}:501`;
const open = (transactions, over = {}) => receipt(transactions, { is_paid: true, is_shipped: false, status: "paid", ...over });
const etsyAnswered = (status) => Object.assign(new Error(`Etsy answered ${status} for /shops/1/receipts/x: nope`), { code: "ETSY_REQUEST_FAILED", status });

const setup = ({ fetched = null, ...over } = {}) => {
  const getReceipt = vi.fn(async (id) => (typeof fetched === "function" ? fetched(id) : fetched));
  const t = setupImporter({ parse: parsePrintFileName, getReceipt, ...over });
  t.imports.listRetries = () =>
    [...t.imports.rows.values()].filter((r) => r.state === ETSY_IMPORT_STATE.RETRY).map((r) => ({ receiptId: r.receiptId, transactionId: r.transactionId }));
  return { ...t, getReceipt };
};

describe("Etsy answers 404 for an order fetched for a Retry", () => {
  it("its RETRY line goes back to NEEDS_REVIEW with the reason; the tick does not stop", async () => {
    const t = setup({
      fetched: () => {
        throw etsyAnswered(404);
      },
    });
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    const out = await t.tick();
    expect(out).toMatchObject({ ran: true, reason: null, needsReview: 1 });
    expect(t.imports.rows.get(KEY)).toMatchObject({
      state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
      reason: `Etsy has no order ET${ID} in this shop (404).`,
      manualXwd: "173706",
    });
    expect(t.imports.moves[0]).toMatchObject({ from: [ETSY_IMPORT_STATE.RETRY], state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.disk.calls.copy).toBe(0);
  });

  it("the order behind it is fetched and imported in the SAME tick (no head of line)", async () => {
    const OTHER = "4444444444";
    const t = setup({
      fetched: (id) => {
        if (id === ID) throw etsyAnswered(404);
        return open([lm({ sku: "" })], { receipt_id: Number(OTHER) });
      },
    });
    t.imports.putRetry({ manualXwd: "173706" }); // the 404 one, first in the table
    t.imports.putRetry({ receiptId: OTHER, manualXwd: "173706" });
    t.setReceipts([]);
    const out = await t.tick();
    expect(t.getReceipt.mock.calls.map(([id]) => id)).toEqual([ID, OTHER]);
    expect(out).toMatchObject({ reason: null, imported: 1, needsReview: 1 });
    expect(t.imports.rows.get(`${OTHER}:501`).state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(inboxOf(t.disk, "Drill")).toHaveLength(1);
  });

  it("any other answer of Etsy still ends the tick and leaves the line RETRY for the next one", async () => {
    for (const status of [401, 403, 429, 500]) {
      const t = setup({
        fetched: () => {
          throw etsyAnswered(status);
        },
      });
      t.imports.putRetry();
      t.setReceipts([]);
      const out = await t.tick();
      expect(out.reason).toMatch(new RegExp(`Etsy answered ${status}`));
      expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
    }
  });

  it("a person who dismissed the line meanwhile wins (the guarded move)", async () => {
    const t = setup({
      fetched: () => {
        throw etsyAnswered(404);
      },
    });
    t.imports.putRetry();
    t.imports.beforeMove = () => {
      t.imports.rows.get(KEY).state = ETSY_IMPORT_STATE.DISMISSED;
    };
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ needsReview: 0, skipped: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DISMISSED);
  });
});

describe("a RETRY line the fetched (paid, open) order no longer carries", () => {
  it("goes back to NEEDS_REVIEW with the reason; the lines it does carry are imported", async () => {
    const t = setup({ fetched: open([lm({ transaction_id: 502, sku: "" })]) });
    t.imports.putRetry({ manualXwd: "173706" }); // line 501 - not on the order any more
    t.imports.putRetry({ transactionId: "502", manualXwd: "173706" });
    t.setReceipts([]);
    const out = await t.tick();
    // skipped 0: only the missing line is moved - the imported one is not offered to the guarded move again.
    expect(out).toMatchObject({ reason: null, imported: 1, needsReview: 1, skipped: 0 });
    expect(t.imports.moves.filter((m) => m.state === ETSY_IMPORT_STATE.NEEDS_REVIEW).map((m) => m.transactionId)).toEqual(["501"]);
    expect(t.imports.rows.get(KEY)).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason: `Etsy's order ET${ID} no longer has this line.` });
    expect(t.imports.rows.get(`${ID}:502`).state).toBe(ETSY_IMPORT_STATE.DONE);
  });

  it("an order sent without lines: every RETRY line of it goes back, nothing copied", async () => {
    const t = setup({ fetched: open([]) });
    t.imports.putRetry();
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ reason: null, needsReview: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.NEEDS_REVIEW);
    expect(t.disk.calls.copy).toBe(0);
  });

  it("no longer takes one of the fetches on the next tick", async () => {
    const t = setup({ fetched: open([]) });
    t.imports.putRetry();
    t.setReceipts([]);
    await t.tick();
    await t.tick();
    expect(t.getReceipt).toHaveBeenCalledTimes(1);
  });

  it("a move that cannot be written ends the tick with the reason", async () => {
    const t = setup({ fetched: open([]) });
    t.imports.putRetry();
    t.imports.failMove = true;
    t.setReceipts([]);
    expect((await t.tick()).reason).toMatch(/import table could not be written/);
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
  });
});

describe("D78: the requests of a tick have one source", () => {
  it("the engine's bound is the shared one, and a tick costs at most one list page + that many fetches", () => {
    expect(MAX_UNLISTED_RETRY_ORDERS).toBe(SHARED_MAX);
    expect(ETSY_TICK_MAX_REQUESTS).toBe(1 + SHARED_MAX);
  });

  it("the pace line of Settings > Etsy multiplies by it", () => {
    const ticks = 720; // every 2 minutes
    expect(etsyPaceLine(2, null)).toContain(`to ${(ticks * ETSY_TICK_MAX_REQUESTS).toLocaleString("en-GB")} Etsy requests a day.`);
  });

  it("neither the engine nor the pace line keeps its own number", () => {
    const source = (rel) =>
      readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
    expect(source("./etsyImport.js")).not.toMatch(/MAX_UNLISTED_RETRY_ORDERS\s*=/);
    expect(source("../../ui/utils/etsyView.js")).not.toMatch(/ticks \* \d/);
    // The equal number written by hand would pass the value check above; the derivation is what is pinned.
    expect(source("../../shared/etsyImportInterval.js")).toMatch(/ETSY_TICK_MAX_REQUESTS = 1 \+ MAX_UNLISTED_RETRY_ORDERS;/);
  });
});
