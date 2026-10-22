import { describe, it, expect, vi } from "vitest";

// D80: a RETRY line of an order the tick DOES list, which the listed order no longer carries, used to stay RETRY for
// good (the bar kept saying "waiting"). Now it goes back to NEEDS_REVIEW by the guarded move, like the same line of an
// order fetched by its number (etsyImport.retryUnlisted.test.js). Same isolation of the parser as etsyImport.test.js.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { setupImporter, lm, receipt } from "./etsyImport.testkit.js";

const ID = "3456789012";
const KEY = `${ID}:501`;

const setup = () => {
  const getReceipt = vi.fn(async () => null);
  const t = setupImporter({ parse: parsePrintFileName, getReceipt });
  t.imports.listRetries = () =>
    [...t.imports.rows.values()].filter((r) => r.state === ETSY_IMPORT_STATE.RETRY).map((r) => ({ receiptId: r.receiptId, transactionId: r.transactionId }));
  return { ...t, getReceipt };
};

describe("a RETRY line the listed order no longer carries", () => {
  it("goes back to NEEDS_REVIEW with the reason, through the guarded move, and nothing is fetched", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" }); // line 501
    t.setReceipts([receipt([lm({ transaction_id: 502 })])]);
    const out = await t.tick();
    expect(out).toMatchObject({ ran: true, needsReview: 1 });
    expect(t.imports.rows.get(KEY)).toMatchObject({
      state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
      reason: `Etsy's order ET${ID} no longer has this line.`,
      manualXwd: "173706",
    });
    expect(t.imports.moves[0]).toMatchObject({ from: [ETSY_IMPORT_STATE.RETRY], state: ETSY_IMPORT_STATE.NEEDS_REVIEW });
    expect(t.getReceipt).not.toHaveBeenCalled();
  });

  it("a line the list still carries is the list's own (imported, not sent back)", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([receipt([lm({ sku: "" })])]);
    expect(await t.tick()).toMatchObject({ imported: 1, needsReview: 0 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
  });

  it("a listed order that sends no transactions array says nothing about its lines: the row waits", async () => {
    const t = setup();
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([{ ...receipt([lm()]), transactions: undefined }]);
    await t.tick();
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
    expect(t.imports.moves).toEqual([]);
  });

  it("a person who dismissed the line meanwhile wins (the move is the guarded one)", async () => {
    const t = setup();
    t.imports.putRetry();
    t.imports.beforeMove = () => {
      t.imports.rows.get(KEY).state = ETSY_IMPORT_STATE.DISMISSED;
    };
    t.setReceipts([receipt([lm({ transaction_id: 502 })])]);
    expect(await t.tick()).toMatchObject({ needsReview: 0, skipped: 1 });
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DISMISSED);
  });

  it("a move that cannot be written ends the tick with the reason", async () => {
    const t = setup();
    t.imports.putRetry();
    t.imports.failMove = true;
    t.setReceipts([receipt([lm({ transaction_id: 502 })])]);
    expect((await t.tick()).reason).toMatch(/import table could not be written/);
    expect(t.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.RETRY);
  });
});
