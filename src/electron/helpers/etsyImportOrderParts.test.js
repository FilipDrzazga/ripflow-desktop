import { describe, it, expect } from "vitest";
import { etsyImportGate } from "./etsyImportGate.js";
import { etsyReceiptIdOf } from "./etsyImportRequests.js";
import { createEtsyClient, ETSY_API_BASE } from "./etsyApi.js";
import { ETSY_TOKEN_URL } from "./etsyOAuth.js";

// "Import this order" (plan E5): the small parts around the engine - the gate without the start date, the one
// number the renderer may send, and the Etsy call that fetches the order again.

const OPEN = {
  paused: false,
  dbOpen: true,
  featureOn: true,
  enabled: true,
  storageSet: true,
  libraryPath: "D:\\ETSY",
  since: 1760000000,
  etsyStatus: { connected: true, shopId: 777 },
};

describe("etsyImportGate with anyStartDate", () => {
  it("drops ONLY the start date: no start date and still open", () => {
    expect(etsyImportGate({ ...OPEN, since: null, anyStartDate: true })).toBeNull();
  });

  it("without it the start date still closes the gate", () => {
    expect(etsyImportGate({ ...OPEN, since: null })).toBe("the import has no start date");
    expect(etsyImportGate({ ...OPEN, since: null, anyStartDate: "true" })).toBe("the import has no start date");
  });

  it.each([
    ["paused", { paused: true }],
    ["no database", { dbOpen: false }],
    ["flag off", { featureOn: false }],
    ["not the importer station", { enabled: false }],
    ["no storage", { storageSet: false }],
    ["no library", { libraryPath: "" }],
    ["no key", { etsyStatus: null }],
    ["not connected", { etsyStatus: { connected: false, shopId: 777 } }],
  ])("every other fact still closes it: %s", (_label, change) => {
    expect(etsyImportGate({ ...OPEN, ...change, anyStartDate: true })).not.toBeNull();
  });
});

describe("etsyReceiptIdOf", () => {
  it("digits pass (surrounding spaces trimmed)", () => {
    expect(etsyReceiptIdOf(" 3456789012 ")).toBe("3456789012");
  });

  it.each([[3456789012], [""], ["12a"], ["../1"], ["1".repeat(21)], [null], [undefined]])("%j is refused as a Warning", (value) => {
    expect(() => etsyReceiptIdOf(value)).toThrow(expect.objectContaining({ code: "INVALID_ETSY_RECEIPT", type: "Warning" }));
  });
});

describe("client.getReceipt", () => {
  const credentials = (shopId) => ({
    secrets: () => ({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.R" }),
    status: () => ({ shopId }),
    saveRefreshToken: () => {},
  });
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const route = () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push(url);
      if (`${init.method ?? "GET"} ${url}` === `POST ${ETSY_TOKEN_URL}`) return json(200, { access_token: "42.A", expires_in: 3600 });
      if (url === `${ETSY_API_BASE}/shops/777/receipts/3456789012`) return json(200, { receipt_id: 3456789012, transactions: [] });
      throw new Error(`unexpected request ${url}`);
    };
    return { fetch, calls };
  };

  it("asks getShopReceipt of the connected shop and returns the receipt whole", async () => {
    const { fetch } = route();
    expect(await createEtsyClient({ credentials: credentials(777), fetch }).getReceipt("3456789012")).toEqual({ receipt_id: 3456789012, transactions: [] });
  });

  it("anything but digits never reaches a request", async () => {
    const { fetch, calls } = route();
    await expect(createEtsyClient({ credentials: credentials(777), fetch }).getReceipt("1/../../users/me")).rejects.toMatchObject({ code: "ETSY_BAD_RECEIPT" });
    expect(calls).toEqual([]);
  });

  it("not connected -> refused", async () => {
    const { fetch } = route();
    await expect(createEtsyClient({ credentials: credentials(null), fetch }).getReceipt("3456789012")).rejects.toMatchObject({ code: "ETSY_NOT_CONNECTED" });
  });
});
