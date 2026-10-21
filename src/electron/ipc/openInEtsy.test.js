import { describe, it, expect, vi, beforeEach } from "vitest";

// openInEtsy opens a browser, an effect, so its one gate is pinned here: only an ET<digits>
// order number builds a link, and the link is the seller's Shop Manager order page with the
// receipt id and nothing else. electron is neutralised; toIpcError is the REAL helper,
// because the error envelope is part of the contract (same as openInShopify.test.js).

const h = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve()),
}));

vi.mock("electron", () => ({ shell: { openExternal: h.openExternal } }));

import { openInEtsy } from "./openInEtsy.js";

beforeEach(() => {
  h.openExternal.mockClear();
});

describe("openInEtsy", () => {
  it("opens the Shop Manager page of the receipt", async () => {
    const res = await openInEtsy("ET3456789012");
    expect(res.success).toBe(true);
    expect(res.errors).toEqual([]);
    expect(h.openExternal).toHaveBeenCalledTimes(1);
    expect(h.openExternal.mock.calls[0][0]).toBe("https://www.etsy.com/your/orders/sold?order_id=3456789012");
  });

  it("accepts the lower-case prefix the parser never produces but a hand-typed call might", async () => {
    await openInEtsy("et12");
    expect(h.openExternal.mock.calls[0][0]).toBe("https://www.etsy.com/your/orders/sold?order_id=12");
  });

  it.each([["ON312819"], [""], ["ET"], ["ET12&x=1"], [null], [42]])("refuses %j and opens nothing", async (value) => {
    const res = await openInEtsy(value);
    expect(res.success).toBe(false);
    expect(h.openExternal).not.toHaveBeenCalled();
    expect(res.errors[0]).toMatchObject({ code: "INVALID_ETSY_ORDER", stage: "validate", title: "Open in Etsy failed" });
  });

  it("reports a failed browser launch instead of throwing", async () => {
    h.openExternal.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("no browser"), { code: "ENOENT" })));
    const res = await openInEtsy("ET1");
    expect(res.success).toBe(false);
    expect(res.errors[0]).toMatchObject({ code: "ENOENT", stage: "open", message: "no browser" });
  });
});
