import { describe, it, expect } from "vitest";
import { createEtsyClient, summarizeReceipt, ETSY_API_BASE } from "./etsyApi.js";
import { ETSY_TOKEN_URL, ETSY_REDIRECT_URI } from "./etsyOAuth.js";

// A credentials double with the same surface as etsyCredentials.js, and a fetch that answers
// from a route table and records every call.
const makeCredentials = (initial = { keystring: "KEY", sharedSecret: "SECRET", refreshToken: null }) => {
  const state = { secrets: { ...initial }, saved: [], rotated: [], shopId: null };
  return {
    state,
    secrets: () => (state.secrets.keystring ? { ...state.secrets } : null),
    status: () => ({ shopId: state.shopId }),
    saveConnection: (c) => {
      state.saved.push(c);
      state.secrets.refreshToken = c.refreshToken;
      state.shopId = c.shopId;
    },
    saveRefreshToken: (t) => {
      state.rotated.push(t);
      state.secrets.refreshToken = t;
    },
  };
};

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const makeFetch = (routes) => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request ${key}`);
    return typeof route === "function" ? route(url, init) : route;
  };
  return { fetch, calls };
};

const TOKEN = `POST ${ETSY_TOKEN_URL}`;

describe("etsyApi - sign-in", () => {
  it("code -> tokens -> users/me -> shop -> saved, with the app key and bearer on every call", async () => {
    const credentials = makeCredentials();
    const { fetch, calls } = makeFetch({
      [TOKEN]: json(200, { access_token: "42.ACCESS", refresh_token: "42.REFRESH", expires_in: 3600 }),
      [`GET ${ETSY_API_BASE}/users/me`]: json(200, { user_id: 42, shop_id: 777 }),
      [`GET ${ETSY_API_BASE}/shops/777`]: json(200, { shop_id: 777, shop_name: "FashionFormula" }),
    });
    const client = createEtsyClient({ credentials, fetch });

    const who = await client.completeSignIn({ code: "CODE", verifier: "VERIFIER" });

    expect(who).toEqual({ userId: 42, shopId: 777, shopName: "FashionFormula" });
    expect(credentials.state.saved).toEqual([{ refreshToken: "42.REFRESH", userId: 42, shopId: 777, shopName: "FashionFormula" }]);
    const tokenBody = Object.fromEntries(new URLSearchParams(calls[0].init.body));
    expect(tokenBody).toEqual({ grant_type: "authorization_code", client_id: "KEY", redirect_uri: ETSY_REDIRECT_URI, code: "CODE", code_verifier: "VERIFIER" });
    for (const call of calls.slice(1)) {
      expect(call.init.headers["x-api-key"]).toBe("KEY:SECRET");
      expect(call.init.headers.Authorization).toBe("Bearer 42.ACCESS");
    }
  });

  it("an account without a shop is refused and NOTHING is saved", async () => {
    const credentials = makeCredentials();
    const { fetch } = makeFetch({
      [TOKEN]: json(200, { access_token: "42.ACCESS", refresh_token: "42.REFRESH", expires_in: 3600 }),
      [`GET ${ETSY_API_BASE}/users/me`]: json(200, { user_id: 42, shop_id: null }),
    });
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.completeSignIn({ code: "C", verifier: "V" })).rejects.toMatchObject({ code: "ETSY_NO_SHOP" });
    expect(credentials.state.saved).toEqual([]);
  });

  it("Etsy refusing the code: ETSY_TOKEN_FAILED with Etsy's reason, nothing saved", async () => {
    const credentials = makeCredentials();
    const { fetch } = makeFetch({ [TOKEN]: json(400, { error: "invalid_grant", error_description: "code expired" }) });
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.completeSignIn({ code: "C", verifier: "V" })).rejects.toMatchObject({
      code: "ETSY_TOKEN_FAILED",
      message: expect.stringContaining("code expired"),
    });
    expect(credentials.state.saved).toEqual([]);
  });

  it("no key on the station: ETSY_NO_KEY before any request", async () => {
    const credentials = makeCredentials({ keystring: null });
    const { fetch, calls } = makeFetch({});
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.completeSignIn({ code: "C", verifier: "V" })).rejects.toMatchObject({ code: "ETSY_NO_KEY" });
    expect(calls).toEqual([]);
  });
});

describe("etsyApi - access token", () => {
  const refreshRoutes = (refreshAnswer) => ({
    [TOKEN]: refreshAnswer,
    [`GET ${ETSY_API_BASE}/shops/777`]: json(200, { shop_name: "FF" }),
  });

  it("refreshes once, reuses the token for its hour, refreshes again after it", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.OLD" });
    let t = 0;
    const { fetch, calls } = makeFetch(refreshRoutes(json(200, { access_token: "42.A", refresh_token: "42.OLD", expires_in: 3600 })));
    const client = createEtsyClient({ credentials, fetch, now: () => t });

    await client.get("/shops/777");
    await client.get("/shops/777");
    expect(calls.filter((c) => c.url === ETSY_TOKEN_URL)).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(calls[0].init.body))).toEqual({ grant_type: "refresh_token", client_id: "KEY", refresh_token: "42.OLD" });

    t = 3600 * 1000 - 30 * 1000; // inside the last minute
    await client.get("/shops/777");
    expect(calls.filter((c) => c.url === ETSY_TOKEN_URL)).toHaveLength(2);
    expect(credentials.state.rotated).toEqual([]); // same refresh token back = nothing to save
  });

  it("a rotated refresh token is saved", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.OLD" });
    const { fetch } = makeFetch(refreshRoutes(json(200, { access_token: "42.A", refresh_token: "42.NEW", expires_in: 3600 })));
    const client = createEtsyClient({ credentials, fetch });
    await client.accessToken();
    expect(credentials.state.rotated).toEqual(["42.NEW"]);
  });

  it("invalid_grant on refresh = sign in again (ETSY_RECONNECT)", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.OLD" });
    const { fetch } = makeFetch(refreshRoutes(json(400, { error: "invalid_grant" })));
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.accessToken()).rejects.toMatchObject({ code: "ETSY_RECONNECT" });
  });

  it("not connected: ETSY_NOT_CONNECTED, no request", async () => {
    const credentials = makeCredentials();
    const { fetch, calls } = makeFetch({});
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.accessToken()).rejects.toMatchObject({ code: "ETSY_NOT_CONNECTED" });
    expect(calls).toEqual([]);
  });

  it("a 401 drops the cached token, so the next call refreshes", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.OLD" });
    let shopAnswer = json(401, { error: "invalid_token" });
    const { fetch, calls } = makeFetch({
      [TOKEN]: json(200, { access_token: "42.A", expires_in: 3600 }),
      [`GET ${ETSY_API_BASE}/shops/777`]: () => shopAnswer,
    });
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.get("/shops/777")).rejects.toMatchObject({ code: "ETSY_REQUEST_FAILED", status: 401 });
    shopAnswer = json(200, {});
    await client.get("/shops/777");
    expect(calls.filter((c) => c.url === ETSY_TOKEN_URL)).toHaveLength(2);
  });

  it("network down: ETSY_UNREACHABLE", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.OLD" });
    const client = createEtsyClient({
      credentials,
      fetch: async () => {
        throw new Error("getaddrinfo ENOTFOUND api.etsy.com");
      },
    });
    await expect(client.accessToken()).rejects.toMatchObject({ code: "ETSY_UNREACHABLE" });
  });
});

describe("etsyApi - Test connection", () => {
  it("asks for the newest paid order and returns only the fields the import reads", async () => {
    const credentials = makeCredentials({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.R" });
    credentials.state.shopId = 777;
    const receipt = {
      receipt_id: 3456789012,
      create_timestamp: 1761043200,
      name: "Jane Buyer",
      first_line: "1 Secret Street",
      buyer_email: "jane@example.com",
      transactions: [
        {
          title: "Octopus Fabric by andrea_lauren",
          listing_id: 111,
          product_id: 222,
          sku: "",
          quantity: 2,
          variations: [
            { formatted_name: "Fabric", formatted_value: "Canvas" },
            { formatted_name: "Amount", formatted_value: "Linear Metre" },
          ],
        },
      ],
    };
    const { fetch, calls } = makeFetch({
      [TOKEN]: json(200, { access_token: "42.A", expires_in: 3600 }),
      [`GET ${ETSY_API_BASE}/shops/777`]: json(200, { shop_name: "FashionFormula" }),
      [`GET ${ETSY_API_BASE}/shops/777/receipts`]: json(200, { count: 5, results: [receipt] }),
    });
    const client = createEtsyClient({ credentials, fetch });

    const test = await client.testConnection();

    const receiptsCall = new URL(calls.find((c) => c.url.includes("/receipts")).url);
    expect(Object.fromEntries(receiptsCall.searchParams)).toEqual({ limit: "1", was_paid: "true", sort_on: "created", sort_order: "desc" });
    expect(test).toEqual({
      shop: { id: 777, name: "FashionFormula" },
      paidOrders: 5,
      latest: {
        receiptId: 3456789012,
        created: "2025-10-21T10:40:00.000Z",
        items: [
          {
            title: "Octopus Fabric by andrea_lauren",
            listingId: 111,
            productId: 222,
            sku: "",
            quantity: 2,
            variations: [
              { name: "Fabric", value: "Canvas" },
              { name: "Amount", value: "Linear Metre" },
            ],
          },
        ],
      },
    });
    const text = JSON.stringify(test);
    for (const pii of ["Jane Buyer", "Secret Street", "jane@example.com"]) expect(text).not.toContain(pii);
  });

  it("no shop on this station: ETSY_NOT_CONNECTED", async () => {
    const client = createEtsyClient({ credentials: makeCredentials(), fetch: async () => json(200, {}) });
    await expect(client.testConnection()).rejects.toMatchObject({ code: "ETSY_NOT_CONNECTED" });
  });

  it("summarizeReceipt: no receipt -> null; odd fields -> safe defaults", () => {
    expect(summarizeReceipt(undefined)).toBe(null);
    expect(summarizeReceipt({ receipt_id: 1 })).toEqual({ receiptId: 1, created: null, items: [] });
  });
});
