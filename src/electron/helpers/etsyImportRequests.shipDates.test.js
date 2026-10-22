import { describe, it, expect, vi } from "vitest";
import { createEtsyImportRequests } from "./etsyImportRequests.js";
import { ETSY_SHIP_DATES_MAX } from "../../shared/etsyShipBy.js";

// The ship-by dates of the "Ship by" badge (plan ETA-2) through the bar's request module: the same fail-closed gate
// as every other call, only a list of receipt digits crosses (never the table), the answer only carries real dates.
const make = (over = {}) => {
  const parts = {
    featureOn: vi.fn(() => true),
    isImporter: vi.fn(() => false),
    list: vi.fn(() => []),
    requestRetry: vi.fn(),
    dismiss: vi.fn(),
    requestTick: vi.fn(),
    openExternal: vi.fn(),
    shipDates: vi.fn(() => ({ 123: { shipBy: 1761523200, buyerNote: null } })),
    ...over,
  };
  return { parts, requests: createEtsyImportRequests(parts) };
};

describe("shipDates", () => {
  it("asks the database for the digits, once each, and answers its dates", () => {
    const { parts, requests } = make();
    expect(requests.shipDates(["123", " 123 ", "456"])).toEqual({ success: true, data: { 123: { shipBy: 1761523200, buyerNote: null } } });
    expect(parts.shipDates).toHaveBeenCalledWith(["123", "456"]);
  });

  it("refuses with features.etsy off and does not touch the database", () => {
    const { parts, requests } = make({ featureOn: () => false });
    expect(requests.shipDates(["123"])).toMatchObject({ success: false, error: { code: "ETSY_DISABLED" } });
    expect(parts.shipDates).not.toHaveBeenCalled();
  });

  it.each([
    ["not a list", "123"],
    ["no list", undefined],
    ["a number inside", [123]],
    ["letters inside", ["12a"]],
    ["an order number instead of the receipt", ["ET123"]],
    ["an empty string inside", [""]],
  ])("a request that is %s is refused before any read", (_label, ids) => {
    const { parts, requests } = make();
    expect(requests.shipDates(ids)).toMatchObject({ success: false, error: { code: expect.stringMatching(/^INVALID_ETSY_RECEIPT$/) } });
    expect(parts.shipDates).not.toHaveBeenCalled();
  });

  it("an empty list is an empty answer and costs no read", () => {
    const { parts, requests } = make();
    expect(requests.shipDates([])).toEqual({ success: true, data: {} });
    expect(parts.shipDates).not.toHaveBeenCalled();
  });

  it("at the limit is fine, one past it is refused (duplicates do not count twice)", () => {
    const { parts, requests } = make();
    const ids = Array.from({ length: ETSY_SHIP_DATES_MAX }, (_v, i) => String(1000 + i));
    expect(requests.shipDates([...ids, ids[0]]).success).toBe(true);
    expect(requests.shipDates([...ids, "999999"])).toMatchObject({ success: false, error: { code: "TOO_MANY_ETSY_RECEIPTS" } });
    expect(parts.shipDates).toHaveBeenCalledTimes(1);
  });

  it("a database that could not be read is an error, never an answer of no dates", () => {
    const { requests } = make({ shipDates: () => null });
    expect(requests.shipDates(["123"])).toMatchObject({ success: false, error: { code: "DB_READ_FAILED" } });
  });

  it("drops a value that is not a date, whatever the database sent", () => {
    const { requests } = make({ shipDates: () => ({ 1: { shipBy: 1761523200 }, 2: { shipBy: 0 }, 3: { shipBy: "1761523200" }, 4: { shipBy: 1761523200000 }, 5: { shipBy: null } }) });
    expect(requests.shipDates(["1", "2", "3", "4", "5"])).toEqual({ success: true, data: { 1: { shipBy: 1761523200, buyerNote: null } } });
  });
});
