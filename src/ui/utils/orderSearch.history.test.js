import { describe, it, expect } from "vitest";
import { APP_VIEW } from "../constants/appViews";
import { PRODUCTION_STAGE } from "../../shared/constants";
import { MAX_RESULT_ROWS, ORDER_SEARCH_VIEW, ORDER_SEARCH_WHERE, searchOrders } from "./orderSearch";
import { makeSearchTarget } from "./searchTarget";

// The PRINTED folders as the last resort of the Ctrl+F search (FILIP 2026-10-20): `printedDays` is what the
// background sweep has listed (readPrintedDayNames), and the rows it makes lead to the Batch view.

const batch = (dayName, files, extra = {}) => ({
  name: dayName,
  path: `O:\\PRINTED\\${extra.day ?? "17-09-2026"}\\${dayName}`,
  printer: "BOREAL",
  files,
});
const file = (name, orderId = null, customerName = null) => ({ name, orderId, customerName });
const day = (dayFolder, batches) => ({ dayFolder, batches, unreadableBatches: 0 });

const rowsOf = (res) => res.groups.flatMap((g) => g.rows);

const LAST_MONTH = day("17-09-2026", [
  batch("PRINTED_101010-Satin Gloss-BOREAL", [
    file("ON401365_Ruby Stone_Tee_1of2.pdf", "ON401365", "Ruby Stone"),
    file("ON401366_Sam Reed_Tee_1of1.pdf", "ON401366", "Sam Reed"),
  ]),
]);

describe("searchOrders - the PRINTED folders", () => {
  it("finds an order that only a PRINTED batch still holds, as a History row that leads to its batch", () => {
    const res = searchOrders("ON401365", { printedDays: [LAST_MONTH] });
    const rows = rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fileId: "ON401365_Ruby Stone_Tee_1of2",
      fileName: "ON401365_Ruby Stone_Tee_1of2.pdf",
      where: ORDER_SEARCH_WHERE.HISTORY,
      customerName: "Ruby Stone",
      dayKey: "17-09-2026",
      batchPath: "O:\\PRINTED\\17-09-2026\\PRINTED_101010-Satin Gloss-BOREAL",
      reason: null,
      alsoInProduction: null,
    });
    expect(res.groups[0].orderKey).toBe("ON401365");
    expect(rows[0].target).toEqual({
      view: APP_VIEW.BATCH,
      fileId: "ON401365_Ruby Stone_Tee_1of2",
      dayKey: "17-09-2026",
      batchPath: "O:\\PRINTED\\17-09-2026\\PRINTED_101010-Satin Gloss-BOREAL",
    });
    expect(ORDER_SEARCH_VIEW.BATCH).toBe(APP_VIEW.BATCH);
  });

  it("matches on customer and on the file name like every other row (every token, anywhere)", () => {
    expect(rowsOf(searchOrders("ruby stone", { printedDays: [LAST_MONTH] }))).toHaveLength(1);
    expect(rowsOf(searchOrders("ruby 401365", { printedDays: [LAST_MONTH] }))).toHaveLength(1);
    expect(rowsOf(searchOrders("ruby 401366", { printedDays: [LAST_MONTH] }))).toHaveLength(0);
    expect(rowsOf(searchOrders("tee_1of1", { printedDays: [LAST_MONTH] }))).toHaveLength(1);
  });

  it("a row of the store wins: a stem that has a Production row is not listed again from PRINTED", () => {
    const stem = "ON401365_Ruby Stone_Tee_1of2";
    const productionStages = {
      [stem]: {
        file_id: stem,
        order_id: "ON401365",
        customer_name: "Ruby Stone",
        stage: PRODUCTION_STAGE.QC,
        batch_path: "O:\\PRINTED\\17-09-2026\\PRINTED_101010-Satin Gloss-BOREAL",
        updated_at: "2026-09-17T11:00:00.000Z",
      },
    };
    const rows = rowsOf(searchOrders("ON401365", { productionStages, printedDays: [LAST_MONTH] }));
    expect(rows.map((r) => r.where)).toEqual([PRODUCTION_STAGE.QC]);
  });

  it("a file in the Inbox AND in PRINTED shows both: a fresh copy waits, the old one was printed", () => {
    const files = [
      { items: [{ id: "g_a", orderId: "ON401365", customerName: "Ruby Stone", file: { name: "ON401365_Ruby Stone_Tee_1of2.pdf" } }] },
    ];
    const rows = rowsOf(searchOrders("ON401365", { files, printedDays: [LAST_MONTH] }));
    expect(rows.map((r) => r.where)).toEqual([ORDER_SEARCH_WHERE.INBOX, ORDER_SEARCH_WHERE.HISTORY]);
  });

  it("one row per file stem: a stem printed twice keeps the newest batch", () => {
    const older = day("10-09-2026", [batch("PRINTED_090000-Satin Gloss-BOREAL", [file("ON401365_Ruby Stone_Tee_1of2.pdf", "ON401365")], { day: "10-09-2026" })]);
    const newer = day("17-09-2026", [batch("PRINTED_101010-Satin Gloss-BOREAL", [file("ON401365_Ruby Stone_Tee_1of2.pdf", "ON401365")])]);
    // the sweep delivers newest day first, but the result must not depend on the order
    for (const printedDays of [[newer, older], [older, newer]]) {
      const rows = rowsOf(searchOrders("ON401365", { printedDays }));
      expect(rows).toHaveLength(1);
      expect(rows[0].dayKey).toBe("17-09-2026");
    }
  });

  it("History sorts after every stage of the same order", () => {
    const productionStages = {
      ON401365_B: { file_id: "ON401365_B", order_id: "ON401365", stage: PRODUCTION_STAGE.SHIPPED, batch_path: "O:\\PRINTED\\18-10-2026\\PRINTED_100000-G-BOREAL", updated_at: "2026-10-18T10:00:00.000Z" },
    };
    const res = searchOrders("ON401365", { productionStages, printedDays: [LAST_MONTH] });
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].rows.map((r) => r.where)).toEqual([PRODUCTION_STAGE.SHIPPED, ORDER_SEARCH_WHERE.HISTORY]);
  });

  it("since is the batch's own time, from the day folder and the PRINTED_hhmmss prefix (local time)", () => {
    const row = rowsOf(searchOrders("ON401365", { printedDays: [LAST_MONTH] }))[0];
    expect(new Date(row.since).getTime()).toBe(new Date(2026, 8, 17, 10, 10, 10).getTime());
  });

  it("a day folder that is not a real date has no time, but its files are still found", () => {
    const odd = day("31-02-2026", [batch("PRINTED_101010-G-BOREAL", [file("ON500001_X_Tee_1of1.pdf", "ON500001")], { day: "31-02-2026" })]);
    const row = rowsOf(searchOrders("ON500001", { printedDays: [odd] }))[0];
    expect(row.since).toBeNull();
    expect(row.where).toBe(ORDER_SEARCH_WHERE.HISTORY);
  });

  it("a file the parser gave no order id still sits under the ON number in its name; else the unknown bucket", () => {
    const d = day("17-09-2026", [
      batch("PRINTED_101010-G-BOREAL", [file("ON700001_odd_name.pdf"), file("mystery_file.pdf")]),
    ]);
    const named = searchOrders("ON700001", { printedDays: [d] });
    expect(named.groups[0].orderKey).toBe("ON700001");
    const nameless = searchOrders("mystery", { printedDays: [d] });
    expect(nameless.groups[0].isUnknown).toBe(true);
  });

  it("History rows count toward the 50-row cap like any other", () => {
    const many = day(
      "17-09-2026",
      [batch("PRINTED_101010-G-BOREAL", Array.from({ length: 80 }, (_, i) => file(`ON800001_Zed_Tee_${i + 1}of80.pdf`, "ON800001", "Zed")))],
    );
    const res = searchOrders("ON800001", { printedDays: [many] });
    expect(res.totalRows).toBe(80);
    expect(res.shownRows).toBe(MAX_RESULT_ROWS);
    expect(res.hiddenRows).toBe(30);
  });

  it("tolerates a sweep that has listed nothing, or garbage entries", () => {
    expect(searchOrders("ON401365", { printedDays: [] }).groups).toEqual([]);
    expect(searchOrders("ON401365", { printedDays: [null, {}, { batches: [null, { files: [null, {}] }] }] }).groups).toEqual([]);
    expect(searchOrders("ON401365", {}).groups).toEqual([]);
  });

  it("every History row carries a target the jump accepts - and refuses a row without its batch", () => {
    const row = rowsOf(searchOrders("ON401365", { printedDays: [LAST_MONTH] }))[0];
    const task = makeSearchTarget(row.target, 3);
    expect(task).toEqual({ ...row.target, nonce: 3 });
    expect(makeSearchTarget({ ...row.target, batchPath: null }, 3)).toBeNull();
    expect(makeSearchTarget({ ...row.target, batchPath: "" }, 3)).toBeNull();
  });
});
