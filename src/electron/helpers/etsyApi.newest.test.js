import { describe, it, expect } from "vitest";
import { createEtsyClient, ETSY_API_BASE } from "./etsyApi.js";
import { ETSY_TOKEN_URL } from "./etsyOAuth.js";

// newestPaidReceipt: the dry run of the import reads the newest paid order WITH its lines (Settings > Etsy >
// Check newest order). Same harness shape as etsyApi.test.js, which stays as it is.
const credentials = (shopId) => ({
  secrets: () => ({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.R" }),
  status: () => ({ shopId }),
  saveRefreshToken: () => {},
});
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const route = (receipts) => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(url);
    if (`${init.method ?? "GET"} ${url}` === `POST ${ETSY_TOKEN_URL}`) return json(200, { access_token: "42.A", expires_in: 3600 });
    if (url.startsWith(`${ETSY_API_BASE}/shops/777/receipts`)) return json(200, { count: receipts.length, results: receipts });
    throw new Error(`unexpected request ${url}`);
  };
  return { fetch, calls };
};

describe("newestPaidReceipt", () => {
  it("asks for ONE paid order, newest first, and returns it whole (lines included)", async () => {
    const receipt = { receipt_id: 3456789012, create_timestamp: 1761043200, transactions: [{ transaction_id: 501, sku: "173706" }] };
    const { fetch, calls } = route([receipt]);
    const got = await createEtsyClient({ credentials: credentials(777), fetch }).newestPaidReceipt();
    expect(got).toEqual(receipt);
    const query = Object.fromEntries(new URL(calls.find((u) => u.includes("/receipts"))).searchParams);
    expect(query).toEqual({ limit: "1", was_paid: "true", sort_on: "created", sort_order: "desc" });
  });

  it("a shop without a paid order -> null", async () => {
    const { fetch } = route([]);
    expect(await createEtsyClient({ credentials: credentials(777), fetch }).newestPaidReceipt()).toBeNull();
  });

  it("a station that is not connected -> ETSY_NOT_CONNECTED, and no request is made", async () => {
    const { fetch, calls } = route([]);
    await expect(createEtsyClient({ credentials: credentials(null), fetch }).newestPaidReceipt()).rejects.toMatchObject({ code: "ETSY_NOT_CONNECTED" });
    expect(calls).toEqual([]);
  });
});
