import { describe, it, expect } from "vitest";
import { createEtsyClient, ETSY_API_BASE } from "./etsyApi.js";
import { ETSY_TOKEN_URL } from "./etsyOAuth.js";

// E3b-2: what the background import needs of the client - one shared refresh (D74), a sign-in that leaves
// no token in memory when it saved nothing (D74), and every page of the open orders.

const makeCredentials = (initial = { keystring: "KEY", sharedSecret: "SECRET", refreshToken: "OLD" }, shopId = 777) => {
  const state = { secrets: { ...initial }, rotated: [], saved: [] };
  return {
    state,
    secrets: () => ({ ...state.secrets }),
    status: () => ({ shopId }),
    saveConnection: (c) => state.saved.push(c),
    saveRefreshToken: (t) => {
      state.rotated.push(t);
      state.secrets.refreshToken = t;
    },
  };
};

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const TOKEN = `POST ${ETSY_TOKEN_URL}`;

describe("one refresh at a time (D74)", () => {
  it("two requests that find the token expired together send ONE refresh and save ONE refresh token", async () => {
    const credentials = makeCredentials();
    let refreshes = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const fetch = async (url, init = {}) => {
      if (`${init.method ?? "GET"} ${url}` === TOKEN) {
        refreshes += 1;
        await gate; // the answer is slow: the second caller arrives while the first one is waiting
        return json(200, { access_token: "1.NEW", refresh_token: "1.ROTATED", expires_in: 3600 });
      }
      return json(200, { count: 0, results: [] });
    };
    const client = createEtsyClient({ credentials, fetch });

    const both = Promise.all([client.get("/shops/777/receipts"), client.get("/shops/777/receipts")]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await both;

    expect(refreshes).toBe(1);
    expect(credentials.state.rotated).toEqual(["1.ROTATED"]);
  });

  it("a failed refresh is not remembered: the next call asks again", async () => {
    const credentials = makeCredentials();
    let refreshes = 0;
    const fetch = async (url, init = {}) => {
      if (`${init.method ?? "GET"} ${url}` === TOKEN) {
        refreshes += 1;
        return refreshes === 1 ? json(400, { error: "invalid_grant" }) : json(200, { access_token: "1.NEW", expires_in: 3600 });
      }
      return json(200, {});
    };
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.accessToken()).rejects.toMatchObject({ code: "ETSY_RECONNECT" });
    expect(await client.accessToken()).toBe("1.NEW");
    expect(refreshes).toBe(2);
  });
});

describe("a sign-in that saved nothing leaves no token in memory (D74)", () => {
  it("an account without a shop: the next request does not go out with that account's token", async () => {
    const credentials = makeCredentials();
    const bearers = [];
    const fetch = async (url, init = {}) => {
      const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
      if (key === TOKEN) {
        const body = new URLSearchParams(init.body);
        return body.get("grant_type") === "authorization_code"
          ? json(200, { access_token: "2.ACCOUNT_B", refresh_token: "2.R", expires_in: 3600 })
          : json(200, { access_token: "1.SHOP_A", expires_in: 3600 });
      }
      if (key === `GET ${ETSY_API_BASE}/users/me`) return json(200, { user_id: 2, shop_id: null });
      bearers.push(init.headers?.Authorization);
      return json(200, { count: 0, results: [] });
    };
    const client = createEtsyClient({ credentials, fetch });
    await expect(client.completeSignIn({ code: "C", verifier: "V" })).rejects.toMatchObject({ code: "ETSY_NO_SHOP" });
    await client.get("/shops/777/receipts");
    expect(bearers).toEqual(["Bearer 1.SHOP_A"]);
    expect(credentials.state.saved).toEqual([]);
  });
});

describe("listOpenReceipts", () => {
  const receiptsPage = (from, count) => Array.from({ length: count }, (_, i) => ({ receipt_id: from + i }));

  const client = (pages) => {
    const credentials = makeCredentials();
    const urls = [];
    const fetch = async (url, init = {}) => {
      if (`${init.method ?? "GET"} ${url}` === TOKEN) return json(200, { access_token: "1.A", expires_in: 3600 });
      urls.push(new URL(url));
      const offset = Number(new URL(url).searchParams.get("offset"));
      return json(200, { results: pages[offset / 100] ?? [] });
    };
    return { api: createEtsyClient({ credentials, fetch }), urls };
  };

  it("asks for paid, not shipped, not cancelled orders from the start moment, page by page, until a short page", async () => {
    const { api, urls } = client([receiptsPage(1, 100), receiptsPage(101, 100), receiptsPage(201, 7)]);
    const all = await api.listOpenReceipts({ minCreated: 1760000000 });
    expect(all).toHaveLength(207);
    expect(urls.map((u) => u.searchParams.get("offset"))).toEqual(["0", "100", "200"]);
    const q = urls[0].searchParams;
    expect(Object.fromEntries(q)).toMatchObject({ limit: "100", was_paid: "true", was_shipped: "false", was_canceled: "false", min_created: "1760000000" });
    expect(urls[0].pathname).toBe("/v3/application/shops/777/receipts");
  });

  it("an exact multiple of 100 is followed by one more (empty) page, so nothing is cut off", async () => {
    const { api, urls } = client([receiptsPage(1, 100)]);
    expect(await api.listOpenReceipts({ minCreated: 1 })).toHaveLength(100);
    expect(urls).toHaveLength(2);
  });

  it("more open orders than the cap is refused loudly, not cut short", async () => {
    const full = receiptsPage(1, 100);
    const { api } = client(Array.from({ length: 60 }, () => full));
    await expect(api.listOpenReceipts({ minCreated: 1 })).rejects.toMatchObject({ code: "ETSY_TOO_MANY_ORDERS" });
  });

  it("a station that is not connected to a shop cannot list", async () => {
    const credentials = makeCredentials(undefined, null);
    const api = createEtsyClient({ credentials, fetch: async () => json(200, {}) });
    await expect(api.listOpenReceipts({ minCreated: 1 })).rejects.toMatchObject({ code: "ETSY_NOT_CONNECTED" });
  });
});
