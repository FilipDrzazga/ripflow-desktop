import path from "node:path";
import { describe, it, expect, vi } from "vitest";

// The ship-by date in the Etsy import engine (plan ETA): written at the claim and by a RETRY's move, refreshed on a
// line that already has a row only when Etsy sends a VALID date that differs from the stored one, never cleared, and
// never worth a line - a failed write of it is logged and the line goes on as before. The dry run never writes it.
// Same isolation of the parser and harness as etsyImport.retry.test.js; the harness table knows nothing of the date,
// so each test wraps the call it watches.
vi.mock("./fabricCache.js", () => ({
  getXmlWidthFromCache: () => 1420,
  getFabricTypeFromCache: () => "Cottons",
}));

import { parsePrintFileName } from "./parseFileName.js";
import { ETSY_IMPORT_STATE } from "../../shared/constants.js";
import { STORAGE, setupImporter, makeImports, lm, receipt, inboxOf } from "./etsyImport.testkit.js";

const KEY = "3456789012:501";
const MON = 1761523200;
const WED = 1761696000;
const OLD = "2026-10-22T10:00:00Z"; // older than STALE_PENDING_MS against the harness clock (12:00)

const setup = (over = {}) => setupImporter({ parse: parsePrintFileName, ...over });

// A row as db.js returns it WITH the column: shipBy null = no date yet.
const putRow = (t, state, shipBy, extra = {}) =>
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
    shipBy,
    ...extra,
  });

const withSetShipBy = (t, impl = () => true) => {
  t.imports.setShipBy = vi.fn(impl);
  return t.imports.setShipBy;
};

describe("a new line carries Etsy's date in its claim", () => {
  it("an imported line", async () => {
    const t = setup();
    const claim = vi.spyOn(t.imports, "claim");
    t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
    expect(await t.tick()).toMatchObject({ imported: 1 });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim.mock.calls[0][0].details).toMatchObject({ shipBy: MON, title: "Rose fabric" });
  });

  it("a NEEDS_REVIEW line", async () => {
    const t = setup();
    const claim = vi.spyOn(t.imports, "claim");
    t.setReceipts([receipt([lm({ sku: "", expected_ship_date: MON })])]);
    expect(await t.tick()).toMatchObject({ needsReview: 1 });
    expect(claim.mock.calls[0][0]).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, details: { shipBy: MON } });
  });
});

describe("a line that already has a row: the date is refreshed only when Etsy sends a different valid one", () => {
  it.each([ETSY_IMPORT_STATE.DONE, ETSY_IMPORT_STATE.NEEDS_REVIEW, ETSY_IMPORT_STATE.FAILED, ETSY_IMPORT_STATE.DISMISSED])(
    "%s: NULL -> the date (backfill), and the line is left as it was",
    async (state) => {
      const t = setup();
      const setShipBy = withSetShipBy(t);
      putRow(t, state, null);
      t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
      expect(await t.tick()).toMatchObject({ skipped: 1, imported: 0, reason: null });
      expect(setShipBy).toHaveBeenCalledWith({ receiptId: "3456789012", transactionId: "501", shipBy: MON });
      expect(t.imports.rows.get(KEY).state).toBe(state);
    },
  );

  it("a moved date is written", async () => {
    const t = setup();
    const setShipBy = withSetShipBy(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, MON);
    t.setReceipts([receipt([lm({ expected_ship_date: WED })])]);
    await t.tick();
    expect(setShipBy).toHaveBeenCalledWith({ receiptId: "3456789012", transactionId: "501", shipBy: WED });
  });

  it("the same date costs no write", async () => {
    const t = setup();
    const setShipBy = withSetShipBy(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, MON);
    t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
    await t.tick();
    expect(setShipBy).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["zero", 0],
    ["text", "abc"],
    ["a fraction", 1761523200.5],
    ["milliseconds", MON * 1000],
  ])("Etsy's date %s never touches the stored one", async (_label, value) => {
    const t = setup();
    const setShipBy = withSetShipBy(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, MON);
    t.setReceipts([receipt([lm({ expected_ship_date: value })])]);
    await t.tick();
    expect(setShipBy).not.toHaveBeenCalled();
  });

  it("a row without the column (no shipBy key) is not written to", async () => {
    const t = setup();
    const setShipBy = withSetShipBy(t);
    putRow(t, ETSY_IMPORT_STATE.DONE, undefined);
    delete t.imports.rows.get(KEY).shipBy;
    t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
    await t.tick();
    expect(setShipBy).not.toHaveBeenCalled();
  });

  it("a table without setShipBy (an older wiring) imports as before", async () => {
    const t = setup();
    putRow(t, ETSY_IMPORT_STATE.DONE, null);
    t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
    expect(await t.tick()).toMatchObject({ ran: true, reason: null, skipped: 1 });
  });
});

describe("a failed write of the date costs the date, never the line", () => {
  it("setShipBy throws: the old PENDING row is still settled and the tick goes on to the next line", async () => {
    const logs = [];
    const t2 = setupImporter({ parse: parsePrintFileName, log: (m) => logs.push(m) });
    withSetShipBy(t2, () => {
      throw new Error("database is locked");
    });
    const fileName = "ET3456789012_x.jpg";
    t2.disk.files.set(path.join(STORAGE, "Drill", fileName), 10);
    putRow(t2, ETSY_IMPORT_STATE.PENDING, null, { fileName, folder: "Drill" });
    t2.setReceipts([receipt([lm({ expected_ship_date: MON }), lm({ transaction_id: 502, expected_ship_date: MON })])]);
    const out = await t2.tick();
    expect(out).toMatchObject({ reason: null, imported: 2 });
    expect(t2.imports.rows.get(KEY).state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(t2.imports.rows.get("3456789012:502").state).toBe(ETSY_IMPORT_STATE.DONE);
    expect(logs.some((m) => /ship-by date could not be written \(database is locked\)/.test(m))).toBe(true);
  });

  it("setShipBy answers null (could not): logged, the line goes on", async () => {
    const logs = [];
    const t = setupImporter({ parse: parsePrintFileName, log: (m) => logs.push(m) });
    withSetShipBy(t, () => null);
    putRow(t, ETSY_IMPORT_STATE.DONE, null);
    t.setReceipts([receipt([lm({ expected_ship_date: MON })])]);
    expect(await t.tick()).toMatchObject({ reason: null, skipped: 1 });
    expect(logs.some((m) => /ship-by date could not be written\.$/.test(m))).toBe(true);
  });
});

describe("a RETRY carries the date in its own move", () => {
  it("RETRY -> PENDING: the move carries the date, setShipBy is not asked", async () => {
    const t = setup();
    const setShipBy = withSetShipBy(t);
    t.imports.putRetry({ manualXwd: "173706" });
    t.imports.rows.get(KEY).shipBy = null;
    t.setReceipts([receipt([lm({ sku: "", expected_ship_date: MON })])]);
    expect(await t.tick()).toMatchObject({ imported: 1 });
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.PENDING, details: { shipBy: MON } });
    expect(setShipBy).not.toHaveBeenCalled();
  });

  it("RETRY -> NEEDS_REVIEW: the move carries the date", async () => {
    const t = setup();
    t.imports.putRetry();
    t.setReceipts([receipt([lm({ sku: "", expected_ship_date: WED })])]);
    expect(await t.tick()).toMatchObject({ needsReview: 1 });
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.NEEDS_REVIEW, details: { shipBy: WED } });
  });

  it("an order outside the tick's list, fetched by number for its RETRY line: the same move carries the date", async () => {
    const getReceipt = vi.fn(async () => receipt([lm({ sku: "", expected_ship_date: MON })], { is_paid: true, is_shipped: false, status: "paid" }));
    const t = setup({ getReceipt });
    t.imports.listRetries = () => [{ receiptId: "3456789012", transactionId: "501" }];
    t.imports.putRetry({ manualXwd: "173706" });
    t.setReceipts([]);
    expect(await t.tick()).toMatchObject({ imported: 1, reason: null });
    expect(getReceipt).toHaveBeenCalledWith("3456789012");
    expect(t.imports.moves[0]).toMatchObject({ state: ETSY_IMPORT_STATE.PENDING, details: { shipBy: MON } });
  });
});

describe("the dry run shows the date and writes nothing", () => {
  it("the line carries shipBy; a table that could write it is never asked", async () => {
    const table = makeImports();
    const setShipBy = vi.fn(() => true);
    const t = setupImporter({ parse: parsePrintFileName, imports: { get: table.get, setShipBy } });
    putRow({ imports: table }, ETSY_IMPORT_STATE.DONE, WED);
    const lines = await t.tick.preview(receipt([lm({ expected_ship_date: MON })]));
    expect(lines[0]).toMatchObject({ ok: true, shipBy: MON, recordedState: ETSY_IMPORT_STATE.DONE });
    expect(setShipBy).not.toHaveBeenCalled();
    expect(table.rows.get(KEY).shipBy).toBe(WED);
    expect(inboxOf(t.disk, "Drill")).toEqual([]);
  });

  it("no valid date from Etsy: the line has no shipBy key", async () => {
    const t = setupImporter({ parse: parsePrintFileName, imports: { get: makeImports().get } });
    for (const value of [undefined, 0, "abc"]) {
      const [line] = await t.tick.preview(receipt([lm({ expected_ship_date: value })]));
      expect(line).not.toHaveProperty("shipBy");
    }
  });
});
