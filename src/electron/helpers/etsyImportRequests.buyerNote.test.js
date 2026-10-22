import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";

// MSG-2: the shipDates answer also carries the buyer's note, re-validated in main (etsyBuyerNoteOf) like the date, so the
// renderer only ever sees cleaned text; an order left with neither is not a key.
const make = (found) =>
  createEtsyImportRequests({
    featureOn: () => true,
    isImporter: () => false,
    list: () => [],
    requestRetry: vi.fn(),
    dismiss: vi.fn(),
    requestTick: vi.fn(),
    openExternal: vi.fn(),
    shipDates: () => found,
  });

describe("shipDates carries the buyer's note", () => {
  it("passes a usable note and date through, a note alone and a date alone too", () => {
    const requests = make({
      1: { shipBy: 1761523200, buyerNote: "Gift - please wrap" },
      2: { shipBy: null, buyerNote: "Call me" },
      3: { shipBy: 1761696000, buyerNote: null },
    });
    expect(requests.shipDates(["1", "2", "3"])).toEqual({
      success: true,
      data: {
        1: { shipBy: 1761523200, buyerNote: "Gift - please wrap" },
        2: { shipBy: null, buyerNote: "Call me" },
        3: { shipBy: 1761696000, buyerNote: null },
      },
    });
  });

  it("cleans the note again (control and bidi marks out, newline kept) whatever the database sent", () => {
    const requests = make({ 1: { shipBy: null, buyerNote: "  Line one\r\nLine\u0007 two\u202E  " } });
    expect(requests.shipDates(["1"]).data).toEqual({ 1: { shipBy: null, buyerNote: "Line one\nLine two" } });
  });

  it("drops an order whose note is unusable and has no date, and a note that is not text", () => {
    const requests = make({ 1: { shipBy: null, buyerNote: "   " }, 2: { shipBy: null, buyerNote: 42 }, 3: { shipBy: 0, buyerNote: "" }, 4: null, 5: "text" });
    expect(requests.shipDates(["1", "2", "3", "4", "5"])).toEqual({ success: true, data: {} });
  });

  it("an unusable note does not cost the date of the same order", () => {
    const requests = make({ 1: { shipBy: 1761523200, buyerNote: 42 } });
    expect(requests.shipDates(["1"]).data).toEqual({ 1: { shipBy: 1761523200, buyerNote: null } });
  });
});
