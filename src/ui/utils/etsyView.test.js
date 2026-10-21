import { describe, it, expect } from "vitest";
import { etsyStatusLine, etsyResultNotice, etsyTestRows } from "./etsyView.js";

const base = { encryption: true, readable: true, hasKey: true, keyHint: "...wxyz", connected: false };
const NOW = Date.parse("2026-10-21T12:00:00Z");

describe("etsyStatusLine", () => {
  it("no answer from main is 'unknown', not 'not connected'", () => {
    expect(etsyStatusLine(null).tone).toBe("warn");
    expect(etsyStatusLine(null).text).toMatch(/unknown/i);
  });

  it("each state in order: no encryption, unreadable, no key, key only", () => {
    expect(etsyStatusLine({ ...base, encryption: false }).text).toMatch(/cannot encrypt/);
    expect(etsyStatusLine({ ...base, readable: false, hasKey: false }).text).toMatch(/cannot be read/);
    expect(etsyStatusLine({ ...base, hasKey: false, keyHint: null })).toEqual({ tone: "off", text: "No Etsy key on this station." });
    expect(etsyStatusLine(base).text).toContain("...wxyz");
    expect(etsyStatusLine(base).tone).toBe("off");
  });

  it("connected: shop name and the sign-in end date; past it = warn", () => {
    const connected = { ...base, connected: true, shopId: 777, shopName: "FashionFormula", refreshExpiresAt: "2027-01-19T12:00:00Z" };
    expect(etsyStatusLine(connected, NOW)).toEqual({
      tone: "ok",
      text: "Connected to FashionFormula (shop 777) - sign-in valid until 19 Jan 2027 if unused.",
    });
    expect(etsyStatusLine(connected, Date.parse("2027-02-01T00:00:00Z")).tone).toBe("warn");
  });
});

describe("etsyResultNotice", () => {
  const titles = { title: "Connect to Etsy", success: "Connected." };

  it("success", () => {
    expect(etsyResultNotice({ success: true }, titles)).toEqual({ type: "Success", title: "Connect to Etsy", message: "Connected." });
  });

  it("a cancelled sign-in is a Warning, a refusal an Error", () => {
    expect(etsyResultNotice({ success: false, errors: [{ type: "Warning", title: "Etsy", message: "closed" }] }, titles)).toEqual({
      type: "Warning",
      title: "Connect to Etsy failed",
      message: "closed",
    });
    expect(etsyResultNotice({ success: false, errors: [{ type: "Error", title: "Etsy", message: "no" }] }, titles).type).toBe("Error");
  });

  it("no answer at all is an Error with a message", () => {
    expect(etsyResultNotice(undefined, titles)).toMatchObject({ type: "Error", message: expect.any(String) });
  });
});

describe("etsyTestRows", () => {
  it("one row per item with listing, SKU, quantity and variations", () => {
    const rows = etsyTestRows({
      shop: { id: 777, name: "FF" },
      paidOrders: 5,
      latest: {
        receiptId: 123,
        created: "2026-10-21T10:00:00Z",
        items: [{ title: "Octopus", listingId: 111, sku: "", quantity: 2, variations: [{ name: "Fabric", value: "Canvas" }] }],
      },
    });
    expect(rows).toEqual([
      { label: "Shop", value: "FF (777)" },
      { label: "Paid orders", value: "5" },
      { label: "Newest order", value: "123, 21 Oct 2026" },
      { label: "Item 1", value: "Octopus | listing 111 | SKU (empty) | qty 2 | Fabric: Canvas" },
    ]);
  });

  it("no paid order yet", () => {
    expect(etsyTestRows({ shop: { id: 1, name: "S" }, paidOrders: 0, latest: null }).at(-1)).toEqual({
      label: "Newest order",
      value: "none - no paid order yet",
    });
    expect(etsyTestRows(null)).toEqual([]);
  });
});
