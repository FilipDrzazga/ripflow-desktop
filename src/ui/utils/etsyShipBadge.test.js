import { describe, it, expect } from "vitest";
import { ETSY_SHIP_DATES_MAX } from "../../shared/etsyShipBy";
import { SHIP_TONE, calendarDaysUntil, shipByBadge, shipByOfOrder, shipDateReceiptIds } from "./etsyShipBadge";

// The colour rules of the "Ship by" badge (plan ETA-2). Every moment is built with the LOCAL calendar constructor,
// so the cases mean the same on a station in any time zone - the rule under test is "calendar days in the zone of
// the station", never a count of 24-hour blocks.

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const secondsAt = (...parts) => Math.floor(at(...parts) / 1000);

describe("calendarDaysUntil", () => {
  it("the same calendar day is 0 whatever the hour", () => {
    expect(calendarDaysUntil(secondsAt(2026, 10, 27, 0, 1), at(2026, 10, 27, 23, 59))).toBe(0);
    expect(calendarDaysUntil(secondsAt(2026, 10, 27, 23, 59), at(2026, 10, 27, 0, 1))).toBe(0);
  });

  it("two minutes across midnight are one day apart, both ways", () => {
    expect(calendarDaysUntil(secondsAt(2026, 10, 28, 0, 1), at(2026, 10, 27, 23, 59))).toBe(1);
    expect(calendarDaysUntil(secondsAt(2026, 10, 27, 23, 59), at(2026, 10, 28, 0, 1))).toBe(-1);
  });

  it("a month and a year boundary count days, not months", () => {
    expect(calendarDaysUntil(secondsAt(2026, 11, 1), at(2026, 10, 31, 18))).toBe(1);
    expect(calendarDaysUntil(secondsAt(2027, 1, 2), at(2026, 12, 30, 9))).toBe(3);
  });

  it("the days the clocks change (23 and 25 hours long) still count as one day each", () => {
    // EU 2026: 29 Mar is 23 hours long, 25 Oct is 25 hours long. In a zone without a change they are plain days.
    expect(calendarDaysUntil(secondsAt(2026, 3, 29, 0, 30), at(2026, 3, 28, 23, 30))).toBe(1);
    expect(calendarDaysUntil(secondsAt(2026, 3, 30, 0, 30), at(2026, 3, 28, 23, 30))).toBe(2);
    expect(calendarDaysUntil(secondsAt(2026, 10, 25, 0, 30), at(2026, 10, 24, 23, 30))).toBe(1);
    expect(calendarDaysUntil(secondsAt(2026, 10, 26, 0, 30), at(2026, 10, 24, 23, 30))).toBe(2);
    expect(calendarDaysUntil(secondsAt(2026, 10, 27, 12), at(2026, 10, 25, 12))).toBe(2);
  });
});

describe("shipByBadge", () => {
  const now = at(2026, 10, 22, 15);

  it.each([
    ["three days late", secondsAt(2026, 10, 19, 9), SHIP_TONE.DUE, -3],
    ["yesterday, a minute before midnight", secondsAt(2026, 10, 21, 23, 59), SHIP_TONE.DUE, -1],
    ["today, early morning", secondsAt(2026, 10, 22, 0, 1), SHIP_TONE.DUE, 0],
    ["today, late evening", secondsAt(2026, 10, 22, 23, 59), SHIP_TONE.DUE, 0],
    ["tomorrow, a minute after midnight", secondsAt(2026, 10, 23, 0, 1), SHIP_TONE.SOON, 1],
    ["tomorrow, late evening", secondsAt(2026, 10, 23, 23, 59), SHIP_TONE.SOON, 1],
    ["the day after tomorrow", secondsAt(2026, 10, 24, 0, 1), SHIP_TONE.LATER, 2],
    ["next month", secondsAt(2026, 11, 20), SHIP_TONE.LATER, 29],
  ])("%s -> %s", (_label, seconds, tone, days) => {
    expect(shipByBadge(seconds, now)).toMatchObject({ tone, days });
  });

  it("says the day short, and the year only when it is not this year's", () => {
    expect(shipByBadge(secondsAt(2026, 10, 27), now).text).toBe("Ship by Tue 27 Oct");
    expect(shipByBadge(secondsAt(2027, 1, 4), now).text).toBe("Ship by Mon 4 Jan 2027");
  });

  it("the tooltip carries the full date and how far it is", () => {
    expect(shipByBadge(secondsAt(2026, 10, 19, 9), now).title).toBe("Etsy expects this order to ship by Mon 19 Oct 2026 (3 days late).");
    expect(shipByBadge(secondsAt(2026, 10, 21, 9), now).title).toContain("(1 day late)");
    expect(shipByBadge(secondsAt(2026, 10, 22, 9), now).title).toContain("(due today)");
    expect(shipByBadge(secondsAt(2026, 10, 23, 9), now).title).toContain("(due tomorrow)");
    expect(shipByBadge(secondsAt(2026, 10, 27, 9), now).title).toContain("(in 5 days)");
  });

  it.each([null, undefined, 0, -5, "1761523200", 1761523200.5, 1761523200000, NaN])("no badge for %s (no date, or not seconds)", (value) => {
    expect(shipByBadge(value, now)).toBeNull();
  });

  it("no badge when the clock is not a number", () => {
    expect(shipByBadge(secondsAt(2026, 10, 27), NaN)).toBeNull();
  });
});

describe("shipDateReceiptIds", () => {
  it("keeps only Etsy orders, as their receipt digits, each once", () => {
    expect(shipDateReceiptIds(["ET123", "ON9999", "et123", "ET45", null, undefined, "", "ET", "ET12x"])).toEqual(["45", "123"]);
  });

  it("is the same list for the same screen, whatever the order of the rows", () => {
    expect(shipDateReceiptIds(["ET900", "ET1000", "ET20"])).toEqual(shipDateReceiptIds(["ET20", "ET1000", "ET900"]));
    expect(shipDateReceiptIds(["ET900", "ET1000", "ET20"])).toEqual(["20", "900", "1000"]);
  });

  it("nothing in, nothing out", () => {
    expect(shipDateReceiptIds(undefined)).toEqual([]);
    expect(shipDateReceiptIds([])).toEqual([]);
  });

  it("past the limit the NEWEST numbers stay", () => {
    const ids = Array.from({ length: ETSY_SHIP_DATES_MAX + 5 }, (_v, i) => `ET${3_000_000_000 + i}`);
    const out = shipDateReceiptIds(ids);
    expect(out).toHaveLength(ETSY_SHIP_DATES_MAX);
    expect(out.at(-1)).toBe(String(3_000_000_000 + ETSY_SHIP_DATES_MAX + 4));
    expect(out).not.toContain("3000000000");
  });
});

describe("shipByOfOrder", () => {
  const dates = { 123: { shipBy: 1761523200, buyerNote: null } };

  it("looks the order up by its receipt digits", () => {
    expect(shipByOfOrder(dates, "ET123")).toBe(1761523200);
    expect(shipByOfOrder(dates, "et123")).toBe(1761523200);
  });

  it("an order with no date, a Shopify order, no order and no answer are all null", () => {
    expect(shipByOfOrder(dates, "ET999")).toBeNull();
    expect(shipByOfOrder(dates, "ON123")).toBeNull();
    expect(shipByOfOrder(dates, null)).toBeNull();
    expect(shipByOfOrder(undefined, "ET123")).toBeNull();
  });
});
