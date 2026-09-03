import { describe, it, expect, vi, beforeEach } from "vitest";

// openInShopify.js had no test at all before this cut, and it carried the worst live
// defect of the 2c-bis series: getStoreHandle fell back to DEFAULT_PROFILE, i.e. the
// literal "fashionformulauk". A client with features.shopify granted and no handle of
// their own — or any station whose profile could not be read — was handed a link into
// ANOTHER shop's Shopify admin. These tests pin both halves of the fix: the feature
// gate, and the refusal to substitute anyone else's store.
//
// electron and shopProfile are neutralised (the real module chain pulls better-sqlite3
// in through db.js); toIpcError is deliberately the REAL helper, because the error
// SHAPE is part of what is under test — the cut had to reuse the existing
// Object.assign/toIpcError envelope, not invent a new one.

const h = vi.hoisted(() => ({
  feature: true,
  profile: { integrations: { shopify: { storeHandle: "client-two-store" } } },
  openExternal: vi.fn(() => Promise.resolve()),
  getFeature: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("electron", () => ({ shell: { openExternal: h.openExternal } }));
vi.mock("../helpers/shopProfile.js", () => ({
  getFeature: h.getFeature.mockImplementation((name) => (name === "shopify" ? h.feature : false)),
  getProfile: h.getProfile.mockImplementation(() => h.profile),
}));

import { openInShopify } from "./openInShopify.js";

const ORDER = "ON12345";
const urlOf = () => h.openExternal.mock.calls[0][0];

beforeEach(() => {
  h.feature = true;
  h.profile = { integrations: { shopify: { storeHandle: "client-two-store" } } };
  h.openExternal.mockClear();
  h.getFeature.mockClear();
  h.getProfile.mockClear();
});

describe("openInShopify — gated on features.shopify", () => {
  it("opens the order when the flag is on", () => {
    // The corpse for an over-tight gate: a gate that never opens breaks Alex, whose
    // profile grants shopify.
    return openInShopify(ORDER).then((res) => {
      expect(res.success).toBe(true);
      expect(res.errors).toEqual([]);
      expect(h.openExternal).toHaveBeenCalledTimes(1);
    });
  });

  it("opens nothing when the flag is off", () => {
    h.feature = false;
    return openInShopify(ORDER).then((res) => {
      expect(res.success).toBe(false);
      expect(h.openExternal).not.toHaveBeenCalled();
    });
  });

  it("reports the disabled flag in this file's existing error shape", () => {
    h.feature = false;
    return openInShopify(ORDER).then((res) => {
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].code).toBe("SHOPIFY_DISABLED");
      expect(res.errors[0].title).toBe("Open in Shopify failed");
      expect(res.errors[0].stage).toBe("validate");
    });
  });

  it("asks the profile for exactly the shopify flag", () => {
    // Pins the flag NAME. A typo reads as an absent flag, fails closed, and silently
    // kills the integration for every shop — the failure mode that looks like nothing.
    return openInShopify(ORDER).then(() => {
      expect(h.getFeature).toHaveBeenCalledWith("shopify");
    });
  });

  it("checks the flag BEFORE the order name", () => {
    // Fail-closed first. Pins the required order flag -> orderName: with the checks
    // swapped, a shop without the integration would be told its order number is wrong.
    h.feature = false;
    return openInShopify("").then((res) => {
      expect(res.errors[0].code).toBe("SHOPIFY_DISABLED");
    });
  });
});

describe("openInShopify — the store handle comes from the profile, never a default", () => {
  it("builds the URL from the handle in the profile", () => {
    return openInShopify(ORDER).then(() => {
      expect(urlOf()).toBe("https://admin.shopify.com/store/client-two-store/orders/?query=ON12345");
    });
  });

  it("never substitutes the seeded default handle, handle or no handle", () => {
    // The whole point of part 2. DEFAULT_PROFILE.integrations.shopify.storeHandle is
    // "fashionformulauk" — Alex's shop. The shop WITHOUT a handle of its own is the
    // case that used to be sent there, so this walks both: the one with a handle must
    // reach its own store, the one without must reach nothing at all.
    h.profile = { integrations: { shopify: {} } };
    return openInShopify(ORDER)
      .then(() => {
        h.profile = { integrations: { shopify: { storeHandle: "client-two-store" } } };
        return openInShopify(ORDER);
      })
      .then(() => {
        const opened = h.openExternal.mock.calls.map((c) => c[0]);
        expect(opened.join(" ")).not.toContain("fashionformulauk");
        // Exactly one got through: the shop that has a handle. The other opened nothing
        // rather than borrowing somebody else's store.
        expect(opened).toHaveLength(1);
      });
  });

  it("fails explicitly when the profile carries no handle", () => {
    h.profile = { integrations: { shopify: {} } };
    return openInShopify(ORDER).then((res) => {
      expect(res.success).toBe(false);
      expect(res.errors[0].code).toBe("MISSING_STORE_HANDLE");
      expect(res.errors[0].title).toBe("Open in Shopify failed");
      expect(h.openExternal).not.toHaveBeenCalled();
    });
  });

  it("treats an empty, whitespace-only or structurally absent handle as missing", () => {
    // An empty handle would build a syntactically valid URL pointing at no store; a
    // whitespace one would put a space in the path. Neither may reach openExternal,
    // and neither may fall back to somebody else's store.
    const shapes = [
      { integrations: { shopify: { storeHandle: "" } } },
      { integrations: { shopify: { storeHandle: "   " } } },
      { integrations: { shopify: { storeHandle: null } } },
      { integrations: { shopify: { storeHandle: 12345 } } },
      { integrations: { shopify: null } },
      { integrations: null },
      {},
    ];
    return shapes
      .reduce(
        (chain, profile) =>
          chain.then(() => {
            h.profile = profile;
            return openInShopify(ORDER).then((res) => {
              expect(res.errors[0].code).toBe("MISSING_STORE_HANDLE");
            });
          }),
        Promise.resolve(),
      )
      .then(() => {
        expect(h.openExternal).not.toHaveBeenCalled();
      });
  });

  it("fails when the profile itself could not be read (null)", () => {
    // getProfile() === null is the "DB unreachable" sentinel. Before this cut it landed
    // on the default handle — a stranger's admin panel produced from an unreadable
    // config, which is the failure this whole part exists to remove.
    h.profile = null;
    return openInShopify(ORDER).then((res) => {
      expect(res.errors[0].code).toBe("MISSING_STORE_HANDLE");
      expect(h.openExternal).not.toHaveBeenCalled();
    });
  });
});

describe("openInShopify — the order-name contract is unchanged", () => {
  it("still rejects an empty order name with INVALID_ORDER_NAME", () => {
    return openInShopify("").then((res) => {
      expect(res.success).toBe(false);
      expect(res.errors[0].code).toBe("INVALID_ORDER_NAME");
      expect(h.openExternal).not.toHaveBeenCalled();
    });
  });

  it("still rejects a non-string and a whitespace-only order name", () => {
    return openInShopify(null)
      .then((res) => expect(res.errors[0].code).toBe("INVALID_ORDER_NAME"))
      .then(() => openInShopify("   "))
      .then((res) => expect(res.errors[0].code).toBe("INVALID_ORDER_NAME"))
      .then(() => expect(h.openExternal).not.toHaveBeenCalled());
  });

  it("checks the order name BEFORE the handle", () => {
    // Pins the second half of the required order: orderName -> handle. Swapping these
    // would report a config problem for what is really a missing order number.
    h.profile = { integrations: { shopify: {} } };
    return openInShopify("").then((res) => {
      expect(res.errors[0].code).toBe("INVALID_ORDER_NAME");
    });
  });

  it("still encodes the order name into the query", () => {
    return openInShopify("ON 12345/A").then(() => {
      expect(urlOf()).toBe("https://admin.shopify.com/store/client-two-store/orders/?query=ON%2012345%2FA");
    });
  });
});
