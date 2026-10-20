import { describe, it, expect } from "vitest";
import { emptyState, printedScanNote, whereColors, whereLabel } from "./orderSearchWindow";
import { ORDER_SEARCH_WHERE, searchOrders } from "./orderSearch";
import { PRINTED_SCAN } from "./printedSweep";

const none = searchOrders("zzzzz", {});
const scan = (status, listed = 0, total = 0) => ({ status, days: [], listed, total });

describe("History in the window's labels", () => {
  it("has its own label and colours, not the grey fallback", () => {
    expect(whereLabel(ORDER_SEARCH_WHERE.HISTORY)).toBe("History");
    expect(whereColors(ORDER_SEARCH_WHERE.HISTORY).bg).not.toBe("#f0f0f0");
  });
});

describe("emptyState with the history sweep", () => {
  it("says it is still looking while days are being read, with the count once it is known", () => {
    const early = emptyState("zzzzz", none, scan(PRINTED_SCAN.RUNNING));
    expect(early.title).toBe("Searching older batches...");
    expect(early.hint).not.toContain("days checked");

    const later = emptyState("zzzzz", none, scan(PRINTED_SCAN.RUNNING, 12, 35));
    expect(later.hint).toContain("12 of 35 days checked");
  });

  it("only says 'not found' once the whole history was read", () => {
    const e = emptyState("zzzzz", none, scan(PRINTED_SCAN.DONE, 35, 35));
    expect(e.title).toBe("Not found");
    expect(e.hint).toContain("whole batch history");
  });

  it("does not claim 'not found' when part of the history could not be read", () => {
    const e = emptyState("zzzzz", none, scan(PRINTED_SCAN.PARTIAL, 35, 35));
    expect(e.title).toContain("only partly read");
    expect(e.title).not.toBe("Not found");
  });

  it("with rows to show, or a short query, the scan changes nothing", () => {
    const rows = searchOrders("ruby", { productionStages: { a: { file_id: "a", order_id: "ON1", customer_name: "Ruby", stage: "qc", batch_path: "O:\\PRINTED\\17-10-2026\\P" } } });
    expect(emptyState("ruby", rows, scan(PRINTED_SCAN.RUNNING, 1, 35))).toBeNull();
    expect(emptyState("ab", searchOrders("ab", {}), scan(PRINTED_SCAN.RUNNING)).title).toBe("Keep typing");
    expect(emptyState("", none, scan(PRINTED_SCAN.RUNNING))).toBeNull();
  });
});

describe("printedScanNote (the line under a list that already has rows)", () => {
  it("says the older days are still being read, then goes quiet when everything was", () => {
    expect(printedScanNote(scan(PRINTED_SCAN.RUNNING, 3, 35))).toContain("3 of 35 days");
    expect(printedScanNote(scan(PRINTED_SCAN.RUNNING))).toBe("Searching older batches...");
    expect(printedScanNote(scan(PRINTED_SCAN.DONE, 35, 35))).toBeNull();
    expect(printedScanNote(scan(PRINTED_SCAN.IDLE))).toBeNull();
    expect(printedScanNote(undefined)).toBeNull();
  });

  it("warns that a match may be missing when the history was only partly read", () => {
    expect(printedScanNote(scan(PRINTED_SCAN.PARTIAL, 35, 35))).toContain("partly read");
  });
});
