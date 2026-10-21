import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  openInEtsy: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../services/fileService", () => ({ openInEtsy: h.openInEtsy }));
vi.mock("./notify", () => ({ notify: h.notify }));

import { ORDER_LINK, orderIdOf, orderLinkFor, openEtsyOrder } from "./orderLink.js";

const SHOPIFY_ON = { features: { shopify: true } };
const SHOPIFY_OFF = { features: { shopify: false } };

beforeEach(() => {
  h.openInEtsy.mockReset();
  h.notify.mockReset();
});

describe("orderLinkFor - which Open in ... a menu offers", () => {
  it("an Etsy order gets Etsy, whatever the Shopify flag or profile", () => {
    for (const profile of [SHOPIFY_ON, SHOPIFY_OFF, null]) {
      expect(orderLinkFor("ET3456789012", profile)).toBe(ORDER_LINK.ETSY);
    }
  });

  it("a Shopify order gets Shopify only with features.shopify on", () => {
    expect(orderLinkFor("ON312819", SHOPIFY_ON)).toBe(ORDER_LINK.SHOPIFY);
    expect(orderLinkFor("ON312819", SHOPIFY_OFF)).toBeNull();
    expect(orderLinkFor("ON312819", null)).toBeNull();
  });

  it("no order number keeps the old Shopify entry (its handler warns No order number)", () => {
    expect(orderLinkFor(null, SHOPIFY_ON)).toBe(ORDER_LINK.SHOPIFY);
    expect(orderLinkFor(null, SHOPIFY_OFF)).toBeNull();
  });
});

describe("orderIdOf", () => {
  it("the parsed order number wins", () => {
    expect(orderIdOf("ET12", "ON99_x.pdf")).toBe("ET12");
  });

  it("falls back to the first ON / ET number in the file name, upper-cased", () => {
    expect(orderIdOf(undefined, "et3456789012_Ann_Lee_1of1_x_ETSY.pdf")).toBe("ET3456789012");
    expect(orderIdOf(null, "ON312819_Ann_Lee.pdf")).toBe("ON312819");
    expect(orderIdOf("", "nothing.pdf")).toBeNull();
    expect(orderIdOf(null, undefined)).toBeNull();
  });
});

describe("openEtsyOrder", () => {
  it("opens through the service and stays quiet on success", async () => {
    h.openInEtsy.mockResolvedValue({ success: true, errors: [] });
    await openEtsyOrder("ET12");
    expect(h.openInEtsy).toHaveBeenCalledWith("ET12");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("reports the main-process error through notify", async () => {
    h.openInEtsy.mockResolvedValue({ success: false, errors: [{ type: "Error", title: "Open in Etsy failed", message: "Not an Etsy order number." }] });
    await openEtsyOrder("ON1");
    expect(h.notify).toHaveBeenCalledWith(
      { type: "Error", title: "Open in Etsy failed", message: "Not an Etsy order number." },
      { stage: "app", code: "OPEN_ETSY_FAILED" },
    );
  });
});
