import { describe, it, expect } from "vitest";
import { receiptFacts } from "./etsyApi.js";

// receiptFacts: what the dry run says of the order itself (Settings > Etsy > Check newest order).
const SINCE = 1761043200; // 2025-10-21T10:40:00Z

describe("receiptFacts", () => {
  it("an order placed after the import was switched on is listed; before it is not", () => {
    expect(receiptFacts({ receipt_id: 3456789012, create_timestamp: SINCE + 60 }, SINCE)).toMatchObject({ receiptId: "3456789012", afterStart: true });
    expect(receiptFacts({ receipt_id: 1, create_timestamp: SINCE - 60 }, SINCE).afterStart).toBe(false);
  });

  it("the second it was switched on counts (the tick asks min_created = since)", () => {
    expect(receiptFacts({ create_timestamp: SINCE }, SINCE).afterStart).toBe(true);
  });

  it("no start date, or no creation time -> unknown (null), never a guess", () => {
    expect(receiptFacts({ create_timestamp: SINCE }, null).afterStart).toBeNull();
    expect(receiptFacts({ create_timestamp: SINCE }, 0).afterStart).toBeNull();
    expect(receiptFacts({}, SINCE).afterStart).toBeNull();
  });

  it("the creation time is an ISO string; shipped only when Etsy sent a real boolean; no buyer data leaves", () => {
    const facts = receiptFacts({ receipt_id: 7, create_timestamp: SINCE, is_shipped: true, name: "Jane Buyer", first_line: "1 Secret Street" }, SINCE);
    expect(facts).toEqual({ receiptId: "7", created: "2025-10-21T10:40:00.000Z", afterStart: true, shipped: true });
    expect(receiptFacts({ receipt_id: 7, is_shipped: "yes" }, SINCE).shipped).toBeNull();
  });

  it("no receipt at all is all nulls", () => {
    expect(receiptFacts(undefined, SINCE)).toEqual({ receiptId: null, created: null, afterStart: null, shipped: null });
  });
});
