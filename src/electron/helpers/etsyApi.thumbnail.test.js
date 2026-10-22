import { describe, it, expect } from "vitest";
import { createEtsyClient, ETSY_API_BASE } from "./etsyApi.js";

// listingThumbnailUrl (FILIP 2026-10-22): getListingImages needs only the app key, so it goes without a bearer -
// a station with the key but no sign-in can show pictures too, and no token is refreshed for it.
const credentials = (refreshToken = null) => ({
  secrets: () => ({ keystring: "KEY", sharedSecret: "SECRET", refreshToken }),
  status: () => ({ shopId: null }),
  saveConnection: () => {},
  saveRefreshToken: () => {},
});

const json = (body) => ({ ok: true, status: 200, json: async () => body });

const client = (body, refreshToken) => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return json(body);
  };
  return { c: createEtsyClient({ credentials: credentials(refreshToken), fetch }), calls };
};

const img = (rank, id) => ({ rank, url_75x75: `https://i.etsystatic.com/${id}/il_75x75.jpg`, url_570xN: `https://i.etsystatic.com/${id}/il_570xN.jpg` });

describe("etsyApi - listingThumbnailUrl", () => {
  it("asks /listings/<id>/images with the app key and NO bearer, even with no sign-in", async () => {
    const { c, calls } = client({ count: 1, results: [img(1, "a")] });
    await c.listingThumbnailUrl("1700000001");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ETSY_API_BASE}/listings/1700000001/images`);
    expect(calls[0].init.headers["x-api-key"]).toBe("KEY:SECRET");
    expect(calls[0].init.headers).not.toHaveProperty("Authorization");
  });

  it("the 75x75 of the first image (lowest rank), whatever order Etsy lists them in", async () => {
    const { c } = client({ count: 3, results: [img(3, "c"), img(1, "a"), img(2, "b")] });
    expect(await c.listingThumbnailUrl("1700000001")).toBe("https://i.etsystatic.com/a/il_75x75.jpg");
  });

  it("null for a listing without images (or images without a 75x75)", async () => {
    expect(await client({ count: 0, results: [] }).c.listingThumbnailUrl("1700000001")).toBeNull();
    expect(await client({ count: 1, results: [{ rank: 1, url_75x75: "" }] }).c.listingThumbnailUrl("1700000001")).toBeNull();
    expect(await client({}).c.listingThumbnailUrl("1700000001")).toBeNull();
  });

  it("a listing not named by digits never reaches Etsy", async () => {
    const { c, calls } = client({ results: [] });
    await expect(c.listingThumbnailUrl("17/../x")).rejects.toMatchObject({ code: "ETSY_BAD_LISTING" });
    expect(calls).toHaveLength(0);
  });

  it("the other calls still carry the bearer", async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, init });
      if ((init.method ?? "GET") === "POST") return json({ access_token: "42.ACCESS", refresh_token: "42.REFRESH", expires_in: 3600 });
      return json({ receipt_id: 1 });
    };
    const c = createEtsyClient({ credentials: { ...credentials("42.REFRESH"), status: () => ({ shopId: 777 }) }, fetch });
    await c.getReceipt("1");
    expect(calls.at(-1).init.headers.Authorization).toBe("Bearer 42.ACCESS");
  });
});
