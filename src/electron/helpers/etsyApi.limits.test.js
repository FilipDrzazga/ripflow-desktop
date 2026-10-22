import { describe, it, expect } from "vitest";
import { createEtsyClient, readRateLimits, ETSY_API_BASE } from "./etsyApi.js";

// FILIP 2026-10-22: "how many requests a day may I make?" - Etsy reports the app's allowance in headers on its
// answers (x-limit-per-day, x-remaining-today, x-limit-per-second; the day is a rolling 24 hours). The client keeps
// the last one it saw, and Settings > Etsy shows it.
const headers = (map) => ({ get: (name) => (name in map ? map[name] : null) });
const answer = (status, body, head = null) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: head ?? undefined });

const credentials = {
  secrets: () => ({ keystring: "KEY", sharedSecret: "SECRET", refreshToken: "42.REFRESH" }),
  status: () => ({ shopId: 777 }),
  saveConnection: () => {},
  saveRefreshToken: () => {},
};

const AT = Date.parse("2026-10-22T12:00:00.000Z");

describe("readRateLimits", () => {
  it("reads the three numbers Etsy sends", () => {
    expect(readRateLimits(headers({ "x-limit-per-day": "10000", "x-remaining-today": "9412", "x-limit-per-second": "10" }), AT)).toEqual({
      perDay: 10000,
      remainingToday: 9412,
      perSecond: 10,
      at: "2026-10-22T12:00:00.000Z",
    });
  });

  it("no rate headers at all (or no headers object) = null, never zeros", () => {
    expect(readRateLimits(headers({}), AT)).toBeNull();
    expect(readRateLimits(undefined, AT)).toBeNull();
    expect(readRateLimits({}, AT)).toBeNull();
  });

  it("a header that is not a whole number >= 0 is null on its own", () => {
    expect(readRateLimits(headers({ "x-limit-per-day": "lots", "x-remaining-today": "-3" }), AT)).toBeNull();
    expect(readRateLimits(headers({ "x-limit-per-day": "5000", "x-remaining-today": "" }), AT)).toEqual({ perDay: 5000, remainingToday: null, perSecond: null, at: "2026-10-22T12:00:00.000Z" });
  });
});

describe("the client keeps the last allowance Etsy reported", () => {
  const client = (routes) => {
    const fetch = async (url, init = {}) => {
      const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
      if (key.startsWith("POST")) return answer(200, { access_token: "42.ACCESS", refresh_token: "42.REFRESH", expires_in: 3600 });
      const route = routes.shift();
      if (!route) throw new Error(`unexpected request ${key}`);
      return route;
    };
    return createEtsyClient({ credentials, fetch, now: () => AT });
  };

  it("null before any API answer", () => {
    expect(client([]).rateLimits()).toBeNull();
  });

  it("taken from an answer, kept over a later answer without headers, replaced by a newer one", async () => {
    const c = client([
      answer(200, { receipt_id: 1 }, headers({ "x-limit-per-day": "10000", "x-remaining-today": "9000" })),
      answer(200, { receipt_id: 2 }),
      answer(200, { receipt_id: 3 }, headers({ "x-limit-per-day": "10000", "x-remaining-today": "8990" })),
    ]);
    await c.get(`/shops/777/receipts/1`);
    expect(c.rateLimits()).toMatchObject({ perDay: 10000, remainingToday: 9000 });
    await c.get(`/shops/777/receipts/2`);
    expect(c.rateLimits()).toMatchObject({ remainingToday: 9000 });
    await c.get(`/shops/777/receipts/3`);
    expect(c.rateLimits()).toMatchObject({ remainingToday: 8990 });
  });

  it("an answer Etsy refused still reports the allowance (a 429 is exactly when it matters)", async () => {
    const c = client([answer(429, { error: "Too many requests" }, headers({ "x-limit-per-day": "10000", "x-remaining-today": "0" }))]);
    await expect(c.get(`/shops/777/receipts/1`)).rejects.toMatchObject({ code: "ETSY_REQUEST_FAILED" });
    expect(c.rateLimits()).toMatchObject({ perDay: 10000, remainingToday: 0 });
  });

  it("the base address is Etsy's API (the limits come from API answers, not the token endpoint)", () => {
    expect(ETSY_API_BASE).toMatch(/^https:\/\/api\.etsy\.com\//);
  });
});
