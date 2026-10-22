import { describe, it, expect, vi } from "vitest";
import { createEtsyThumbnails, isEtsyImageUrl, THUMB_KEEP_MS, THUMB_NONE_KEEP_MS, THUMB_FAIL_KEEP_MS, THUMB_MAX_BYTES } from "./etsyThumbnail.js";

// The listing picture of the Inbox bar (FILIP 2026-10-22): asked from Etsy once per listing and kept, fetched only
// from Etsy's image host, handed over as a data: URL.
const URL75 = "https://i.etsystatic.com/12345/r/il/abcdef/1234567890/il_75x75.1234567890_abcd.jpg";
const image = (bytes = 100, type = "image/jpeg", status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name === "content-type" ? type : null) },
  arrayBuffer: async () => new Uint8Array(bytes).fill(7).buffer,
});

const setup = ({ url = URL75, picture = image() } = {}) => {
  let clock = Date.parse("2026-10-22T12:00:00.000Z");
  const thumbnailUrl = vi.fn(async () => (typeof url === "function" ? url() : url));
  const fetch = vi.fn(async () => (typeof picture === "function" ? picture() : picture));
  const lines = [];
  const get = createEtsyThumbnails({ thumbnailUrl, fetch, now: () => clock, log: (line) => lines.push(line) });
  return { get, thumbnailUrl, fetch, lines, advance: (ms) => (clock += ms) };
};

describe("isEtsyImageUrl - only Etsy's image host, over https", () => {
  it("accepts i.etsystatic.com", () => {
    expect(isEtsyImageUrl(URL75)).toBe(true);
  });

  it("refuses any other address", () => {
    expect(isEtsyImageUrl("http://i.etsystatic.com/x.jpg")).toBe(false);
    expect(isEtsyImageUrl("https://etsystatic.com.evil.example/x.jpg")).toBe(false);
    expect(isEtsyImageUrl("https://evil.example/i.etsystatic.com/x.jpg")).toBe(false);
    expect(isEtsyImageUrl("https://user:pw@i.etsystatic.com/x.jpg")).toBe(false);
    expect(isEtsyImageUrl("file:///C:/x.jpg")).toBe(false);
    expect(isEtsyImageUrl("not a url")).toBe(false);
    expect(isEtsyImageUrl(null)).toBe(false);
  });
});

describe("createEtsyThumbnails", () => {
  it("a picture comes back as a data: URL of its own type", async () => {
    const { get } = setup({ picture: image(3, "image/png") });
    expect(await get("1700000001")).toBe(`data:image/png;base64,${Buffer.from([7, 7, 7]).toString("base64")}`);
  });

  it("asks Etsy ONCE per listing and keeps the picture for a day", async () => {
    const { get, thumbnailUrl, fetch, advance } = setup();
    const first = await get("1700000001");
    advance(THUMB_KEEP_MS - 1);
    expect(await get("1700000001")).toBe(first);
    expect(thumbnailUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    await get("1700000001");
    expect(thumbnailUrl).toHaveBeenCalledTimes(2);
  });

  it("two asks at the same time share one fetch", async () => {
    const { get, thumbnailUrl, fetch } = setup();
    const [a, b] = await Promise.all([get("1700000001"), get("1700000001")]);
    expect(a).toBe(b);
    expect(thumbnailUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("each listing is its own entry", async () => {
    const { get, thumbnailUrl } = setup();
    await get("1700000001");
    await get("1700000002");
    expect(thumbnailUrl.mock.calls.map((c) => c[0])).toEqual(["1700000001", "1700000002"]);
  });

  it("a listing without a picture: null, kept for an hour, no image fetch", async () => {
    const { get, thumbnailUrl, fetch, advance } = setup({ url: null });
    expect(await get("1700000001")).toBeNull();
    advance(THUMB_NONE_KEEP_MS - 1);
    expect(await get("1700000001")).toBeNull();
    expect(thumbnailUrl).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    advance(1);
    await get("1700000001");
    expect(thumbnailUrl).toHaveBeenCalledTimes(2);
  });

  it("a failure (no key, Etsy away): null, logged, kept 10 minutes - never thrown at the bar", async () => {
    const { get, thumbnailUrl, lines, advance } = setup({
      url: () => {
        throw Object.assign(new Error("No Etsy key on this station."), { code: "ETSY_NO_KEY" });
      },
    });
    expect(await get("1700000001")).toBeNull();
    expect(lines.join("\n")).toMatch(/1700000001: No Etsy key/);
    advance(THUMB_FAIL_KEEP_MS - 1);
    await get("1700000001");
    expect(thumbnailUrl).toHaveBeenCalledTimes(1);
    advance(1);
    await get("1700000001");
    expect(thumbnailUrl).toHaveBeenCalledTimes(2);
  });

  it("an address off Etsy's image host is never fetched", async () => {
    const { get, fetch } = setup({ url: "https://evil.example/x.jpg" });
    expect(await get("1700000001")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses what is not a small image: another type, a refused answer, an empty or too big body", async () => {
    for (const picture of [image(100, "text/html"), image(100, ""), image(100, "image/jpeg", 404), image(0), image(THUMB_MAX_BYTES + 1)]) {
      const { get } = setup({ picture });
      expect(await get("1700000001")).toBeNull();
    }
    const { get } = setup({ picture: image(THUMB_MAX_BYTES) });
    expect(await get("1700000001")).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("a listing not named by digits is refused before anything is asked", async () => {
    const { get, thumbnailUrl } = setup();
    for (const bad of ["", "abc", "17/../1", "1".repeat(21), null, 1700000001]) {
      await expect(get(bad)).rejects.toMatchObject({ code: "INVALID_ETSY_LISTING" });
    }
    expect(thumbnailUrl).not.toHaveBeenCalled();
  });
});
