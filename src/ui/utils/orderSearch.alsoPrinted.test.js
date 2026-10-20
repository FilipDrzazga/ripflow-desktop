import { describe, it, expect } from "vitest";
import { ORDER_SEARCH_WHERE, searchOrders } from "./orderSearch";

// D71 (FILIP 2026-10-20): a stem that waits in the Inbox / Held AND sits in a PRINTED batch is ONE row - the
// Inbox / Held row, which notes the old print in `alsoPrinted` - like `alsoInProduction` does for Production.

const NAME = "ON401365_Ruby Stone_Tee_1of2.pdf";
const inbox = (name = NAME) => [
  { items: [{ id: "g_a", orderId: "ON401365", customerName: "Ruby Stone", file: { name } }] },
];
const printedBatch = (dayFolder, hhmmss, name = NAME) => ({
  dayFolder,
  batches: [
    {
      name: `PRINTED_${hhmmss}-Satin Gloss-BOREAL`,
      path: `O:\\PRINTED\\${dayFolder}\\PRINTED_${hhmmss}-Satin Gloss-BOREAL`,
      printer: "BOREAL",
      files: [{ name, orderId: "ON401365", customerName: "Ruby Stone" }],
    },
  ],
  unreadableBatches: 0,
});
const rowsOf = (res) => res.groups.flatMap((g) => g.rows);

describe("searchOrders - a PRINTED copy of a file that waits in the Inbox", () => {
  it("is folded into the Inbox row, with the time of the batch, and gets no History row of its own", () => {
    const rows = rowsOf(searchOrders("ON401365", { files: inbox(), printedDays: [printedBatch("17-09-2026", "101010")] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].where).toBe(ORDER_SEARCH_WHERE.INBOX);
    expect(rows[0].alsoPrinted).toEqual({ since: new Date(2026, 8, 17, 10, 10, 10).toISOString() });
  });

  it("does the same for a Held row, and keeps the held reason", () => {
    const rows = rowsOf(
      searchOrders("ON401365", {
        files: inbox(),
        heldIds: new Set(["g_a"]),
        heldReasons: new Map([["g_a", "Waiting for artwork"]]),
        printedDays: [printedBatch("17-09-2026", "101010")],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ where: ORDER_SEARCH_WHERE.HELD, reason: "Waiting for artwork" });
    expect(rows[0].alsoPrinted).not.toBeNull();
  });

  it("keeps the newest of several prints, whatever order the sweep delivers the days in", () => {
    const older = printedBatch("10-09-2026", "090000");
    const newer = printedBatch("17-09-2026", "101010");
    for (const printedDays of [[newer, older], [older, newer]]) {
      const rows = rowsOf(searchOrders("ON401365", { files: inbox(), printedDays }));
      expect(rows).toHaveLength(1);
      expect(rows[0].alsoPrinted.since).toBe(new Date(2026, 8, 17, 10, 10, 10).toISOString());
    }
  });

  it("a day folder that is not a date still notes the print, without a time", () => {
    const rows = rowsOf(searchOrders("ON401365", { files: inbox(), printedDays: [printedBatch("31-02-2026", "101010")] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].alsoPrinted).toEqual({ since: null });
  });

  it("no PRINTED copy, no note; an unrelated PRINTED file does not touch the Inbox row", () => {
    const other = printedBatch("17-09-2026", "101010", "ON999999_Other_Tee_1of1.pdf");
    expect(rowsOf(searchOrders("ON401365", { files: inbox() }))[0].alsoPrinted).toBeNull();
    expect(rowsOf(searchOrders("ON401365", { files: inbox(), printedDays: [other] }))[0].alsoPrinted).toBeNull();
  });

  it("the History row stays when the Inbox row of that stem does not match the query", () => {
    // the file's customer in PRINTED is the only place that says "Zed Quartz"
    const printedDays = [printedBatch("17-09-2026", "101010")];
    printedDays[0].batches[0].files[0].customerName = "Zed Quartz";
    const rows = rowsOf(searchOrders("quartz", { files: inbox(), printedDays }));
    expect(rows.map((r) => r.where)).toEqual([ORDER_SEARCH_WHERE.HISTORY]);
  });
});
