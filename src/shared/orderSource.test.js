import { describe, it, expect } from "vitest";
import { ORDER_SOURCE, ORDER_ID_RE, SHOP_MARKER, orderSourceOf, etsyReceiptId } from "./orderSource.js";

describe("orderSourceOf - the source of an order number", () => {
  it("ET<digits> is an Etsy order, ON<digits> a Shopify one, any case, trimmed", () => {
    expect(orderSourceOf("ET3456789012")).toBe(ORDER_SOURCE.ETSY);
    expect(orderSourceOf(" et12 ")).toBe(ORDER_SOURCE.ETSY);
    expect(orderSourceOf("ON312819")).toBe(ORDER_SOURCE.SHOPIFY);
    expect(orderSourceOf("on1")).toBe(ORDER_SOURCE.SHOPIFY);
  });

  it("anything else has no source", () => {
    for (const v of [null, undefined, "", "ET", "ON", "ETX12", "ET12a", "XON12", 12, "ETSY"]) {
      expect(orderSourceOf(v)).toBeNull();
    }
  });
});

describe("etsyReceiptId", () => {
  it("is the digits of an Etsy order number", () => {
    expect(etsyReceiptId("ET3456789012")).toBe("3456789012");
    expect(etsyReceiptId("et7")).toBe("7");
  });

  it("is null for a Shopify order or anything that is not an order number", () => {
    for (const v of ["ON312819", "ET", "ET12 34", "ET12&x=1", null, 5]) {
      expect(etsyReceiptId(v)).toBeNull();
    }
  });
});

describe("ORDER_ID_RE and SHOP_MARKER", () => {
  it("one whole token, ON or ET", () => {
    expect(ORDER_ID_RE.test("ON1")).toBe(true);
    expect(ORDER_ID_RE.test("ET1")).toBe(true);
    expect(ORDER_ID_RE.test("ON1x")).toBe(false);
    expect(ORDER_ID_RE.test("xET1")).toBe(false);
  });

  it("an Etsy name closes with ETSY where a Shopify one closes with FF", () => {
    expect(SHOP_MARKER[ORDER_SOURCE.SHOPIFY]).toBe("FF");
    expect(SHOP_MARKER[ORDER_SOURCE.ETSY]).toBe("ETSY");
  });
});
