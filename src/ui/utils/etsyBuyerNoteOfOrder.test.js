import { describe, it, expect } from "vitest";
import { buyerNoteOfOrder, shipByOfOrder } from "./etsyShipBadge";

// MSG-2: the buyer's note is read from the SAME answer as the date, by the same receipt digits.
describe("buyerNoteOfOrder", () => {
  const facts = { 123: { shipBy: 1761523200, buyerNote: "Gift - please wrap" }, 456: { shipBy: null, buyerNote: "Call me" }, 789: { shipBy: 1761523200, buyerNote: null } };

  it("looks the order up by its receipt digits, like the date", () => {
    expect(buyerNoteOfOrder(facts, "ET123")).toBe("Gift - please wrap");
    expect(buyerNoteOfOrder(facts, "et456")).toBe("Call me");
    expect(shipByOfOrder(facts, "ET456")).toBeNull();
  });

  it("an order with no note, a Shopify order, no order and no answer are all null", () => {
    expect(buyerNoteOfOrder(facts, "ET789")).toBeNull();
    expect(buyerNoteOfOrder(facts, "ET999")).toBeNull();
    expect(buyerNoteOfOrder(facts, "ON123")).toBeNull();
    expect(buyerNoteOfOrder(facts, null)).toBeNull();
    expect(buyerNoteOfOrder(undefined, "ET123")).toBeNull();
  });
});
