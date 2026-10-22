import { describe, it, expect, vi } from "vitest";
import { createEtsyThumbnails, THUMB_KEEP_MS, THUMB_FAIL_KEEP_MS, THUMB_MAX_BYTES, THUMB_MAX_REDIRECTS } from "./etsyThumbnail.js";

// D79 (S2 2026-10-22, done at FILIP's word 14:19): a listing Etsy answers 404 for is "no picture" for a day; every
// redirect hop is checked against Etsy's image host; the size is checked before / while reading, not after.
const URL75 = "https://i.etsystatic.com/12345/r/il/abcdef/1/il_75x75.1_abcd.jpg";
const headers = (map) => ({ get: (name) => (name in map ? map[name] : null) });
const ok = (bytes = 10, extra = {}) => ({
  ok: true,
  status: 200,
  headers: headers({ "content-type": "image/jpeg", ...extra }),
  arrayBuffer: async () => new Uint8Array(bytes).fill(1).buffer,
});
const redirect = (location, status = 302) => ({ ok: false, status, headers: headers(location === null ? {} : { location }) });
// A body that arrives in chunks and remembers whether it was cut.
const streamed = (chunkSizes, declared = null) => {
  const state = { reads: 0, cancelled: false };
  const reader = {
    read: async () => {
      if (state.reads >= chunkSizes.length) return { done: true, value: undefined };
      const value = new Uint8Array(chunkSizes[state.reads]).fill(2);
      state.reads += 1;
      return { done: false, value };
    },
    cancel: async () => {
      state.cancelled = true;
    },
  };
  return {
    state,
    response: {
      ok: true,
      status: 200,
      headers: headers({ "content-type": "image/png", ...(declared === null ? {} : { "content-length": String(declared) }) }),
      body: { getReader: () => reader },
      arrayBuffer: async () => {
        throw new Error("the whole body must not be read at once");
      },
    },
  };
};

const setup = ({ thumbnailUrl = async () => URL75, answers = [ok()] } = {}) => {
  let clock = Date.parse("2026-10-22T12:00:00.000Z");
  const queue = [...answers];
  const fetch = vi.fn(async () => queue.shift());
  const ask = vi.fn(thumbnailUrl);
  const get = createEtsyThumbnails({ thumbnailUrl: ask, fetch, now: () => clock, log: () => {} });
  return { get, fetch, ask, advance: (ms) => (clock += ms) };
};

const notFound = () => {
  throw Object.assign(new Error("Etsy answered 404 for /listings/1/images: Not found"), { code: "ETSY_REQUEST_FAILED", status: 404 });
};

describe("a listing Etsy no longer has (404)", () => {
  it("is 'no picture' for a DAY - not a failure asked again every 10 minutes", async () => {
    const { get, ask, advance } = setup({ thumbnailUrl: notFound });
    expect(await get("1700000001")).toBeNull();
    advance(THUMB_FAIL_KEEP_MS);
    await get("1700000001");
    advance(THUMB_KEEP_MS - THUMB_FAIL_KEEP_MS - 1);
    await get("1700000001");
    expect(ask).toHaveBeenCalledTimes(1);
    advance(1);
    await get("1700000001");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("other refusals stay failures (10 minutes)", async () => {
    const { get, ask, advance } = setup({
      thumbnailUrl: () => {
        throw Object.assign(new Error("Etsy answered 500"), { status: 500 });
      },
    });
    await get("1700000001");
    advance(THUMB_FAIL_KEEP_MS);
    await get("1700000001");
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("redirects are followed by hand, each hop checked", () => {
  it("never asks the network to follow on its own", async () => {
    const { get, fetch } = setup();
    await get("1700000001");
    expect(fetch).toHaveBeenCalledWith(URL75, { redirect: "manual" });
  });

  it("a hop that stays on Etsy's image host is followed (also a relative address)", async () => {
    const { get, fetch } = setup({ answers: [redirect("https://i2.etsystatic.com/x/il_75x75.jpg"), redirect("/y/il_75x75.jpg", 301), ok(5)] });
    expect(await get("1700000001")).toMatch(/^data:image\/jpeg;base64,/);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([URL75, "https://i2.etsystatic.com/x/il_75x75.jpg", "https://i2.etsystatic.com/y/il_75x75.jpg"]);
  });

  it("a hop off Etsy's image host is NOT fetched", async () => {
    const { get, fetch } = setup({ answers: [redirect("https://evil.example/x.jpg"), ok()] });
    expect(await get("1700000001")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a redirect without an address, or too many, is a failure", async () => {
    expect(await setup({ answers: [redirect(null)] }).get("1700000001")).toBeNull();
    const many = Array.from({ length: THUMB_MAX_REDIRECTS + 1 }, (_, i) => redirect(`https://i.etsystatic.com/hop${i}.jpg`));
    const { get, fetch } = setup({ answers: [...many, ok()] });
    expect(await get("1700000001")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(THUMB_MAX_REDIRECTS + 1);
  });
});

describe("the size is checked before and while reading", () => {
  it("a declared size over the cap is refused without reading the body", async () => {
    const big = streamed([10], THUMB_MAX_BYTES + 1);
    const { get } = setup({ answers: [big.response] });
    expect(await get("1700000001")).toBeNull();
    expect(big.state.reads).toBe(0);
  });

  it("a stream is cut the moment it passes the cap", async () => {
    const half = Math.ceil(THUMB_MAX_BYTES / 2);
    const endless = streamed([half, half, half, half]);
    const { get } = setup({ answers: [endless.response] });
    expect(await get("1700000001")).toBeNull();
    expect(endless.state.reads).toBe(3);
    expect(endless.state.cancelled).toBe(true);
  });

  it("a stream under the cap arrives whole, in its own type", async () => {
    const small = streamed([3, 4]);
    const { get } = setup({ answers: [small.response] });
    expect(await get("1700000001")).toBe(`data:image/png;base64,${Buffer.from(new Uint8Array(7).fill(2)).toString("base64")}`);
  });
});
