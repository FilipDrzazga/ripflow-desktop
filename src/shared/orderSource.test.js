import { describe, it, expect } from "vitest";
import { ORDER_SOURCE, ORDER_ID_RE, SHOP_MARKER, orderSourceOf, etsyReceiptId, orderIdFromFileName } from "./orderSource.js";

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

describe("orderIdFromFileName - the fallback reads a whole token only (D73)", () => {
  it("finds the order number token of a name, upper case, wherever the token stands", () => {
    expect(orderIdFromFileName("ON312819_Ann_Lee_1of1_FF.pdf")).toBe("ON312819");
    expect(orderIdFromFileName("et3456789012_Ann_Lee_ETSY.png")).toBe("ET3456789012");
    expect(orderIdFromFileName("Cottons_ON12_Ann.pdf")).toBe("ON12");
    expect(orderIdFromFileName("Ann_ON12.pdf")).toBe("ON12");
    expect(orderIdFromFileName("ON12")).toBe("ON12");
  });

  it("does not read a number out of the middle of a word", () => {
    for (const v of ["Velvet2_Ann.pdf", "Jacket10 Ann.pdf", "CUSHION1_x.pdf", "xON12_x.pdf", "ON12a_x.pdf", "ON_12_x.pdf"]) {
      expect(orderIdFromFileName(v)).toBeNull();
    }
  });

  it("is null for anything that is not a name", () => {
    for (const v of [null, undefined, "", 5]) {
      expect(orderIdFromFileName(v)).toBeNull();
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
