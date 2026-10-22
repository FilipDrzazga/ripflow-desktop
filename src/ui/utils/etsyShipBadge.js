// The "Ship by" badge of an Etsy order in Inbox and Production (plan ETA-2). Pure: what the date means today (the colour)
// and what the badge says, so the rules can carry tests without rendering. The date itself is Etsy's expected_ship_date
// of the order's lines (etsy_imports.ship_by, the earliest one - plan ETA-1).

import { ETSY_SHIP_DATES_MAX, etsyShipByOf } from "../../shared/etsyShipBy";
import { etsyReceiptId } from "../../shared/orderSource";
import { shipByDay } from "./etsyView";

// How often a view that shows the badges asks main again (a date moves only when Etsy moves it; a new order
// changes the list of numbers, which asks at once).
export const ETSY_SHIP_DATES_POLL_MS = 300_000;

// due = the day has come or gone (red), soon = tomorrow (amber), later = anything further (grey).
export const SHIP_TONE = Object.freeze({ DUE: "due", SOON: "soon", LATER: "later" });

// Whole CALENDAR days from the day of `nowMs` to the day of `seconds`, both read in this station's time zone.
// Built from the local calendar parts, so a 23- or 25-hour day (daylight saving) and the hour of the day never
// change the count: 23:59 and 00:01 are one day apart, 00:01 and 23:59 of the same day are none.
export const calendarDaysUntil = (seconds, nowMs) => {
  const utcDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utcDay(new Date(seconds * 1000)) - utcDay(new Date(nowMs))) / 86_400_000);
};

const toneOf = (days) => (days <= 0 ? SHIP_TONE.DUE : days === 1 ? SHIP_TONE.SOON : SHIP_TONE.LATER);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const whenText = (days) => {
  if (days < 0) return `${plural(-days, "day")} late`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `in ${plural(days, "day")}`;
};

// "Mon 27 Oct", with the year only when it is not this year's (built from parts, like shipByDay: no ICU punctuation).
const shortDay = (seconds, nowMs) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      .formatToParts(new Date(seconds * 1000))
      .map((p) => [p.type, p.value]),
  );
  const sameYear = Number(parts.year) === new Date(nowMs).getFullYear();
  return `${parts.weekday} ${parts.day} ${parts.month}${sameYear ? "" : ` ${parts.year}`}`;
};

// -> { tone, days, text, title } or null for anything etsyShipByOf refuses (no badge, never a guess).
export const shipByBadge = (seconds, nowMs = Date.now()) => {
  const value = etsyShipByOf(seconds);
  if (value === null || !Number.isFinite(nowMs)) return null;
  const days = calendarDaysUntil(value, nowMs);
  return {
    tone: toneOf(days),
    days,
    text: `Ship by ${shortDay(value, nowMs)}`,
    title: `Etsy expects this order to ship by ${shipByDay(value)} (${whenText(days)}).`,
  };
};

// The receipt numbers to ask main about, from the order numbers on screen ("ET123..." -> "123..."): only Etsy orders,
// each once, in ONE order (the same screen always gives the same list - it is the key of the effect), at most
// ETSY_SHIP_DATES_MAX - the newest numbers when there are more.
export const shipDateReceiptIds = (orderIds) => {
  const ids = new Set();
  for (const orderId of orderIds ?? []) {
    const receiptId = etsyReceiptId(orderId);
    if (receiptId) ids.add(receiptId);
  }
  return [...ids].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).slice(-ETSY_SHIP_DATES_MAX);
};

// The facts of one order number, looked up in the answer ({ [receiptId]: { shipBy, buyerNote } }).
const factOfOrder = (facts, orderId, key) => {
  const receiptId = etsyReceiptId(orderId);
  return receiptId ? (facts?.[receiptId]?.[key] ?? null) : null;
};

// The date (epoch s) of one order number; null when it has none.
export const shipByOfOrder = (facts, orderId) => factOfOrder(facts, orderId, "shipBy");

// The buyer's note of one order number (text for React, never markup); null when it has none.
export const buyerNoteOfOrder = (facts, orderId) => factOfOrder(facts, orderId, "buyerNote");
