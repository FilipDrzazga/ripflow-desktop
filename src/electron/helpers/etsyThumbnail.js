// The small picture of an Etsy listing for the Inbox bar (FILIP 2026-10-22, list 12:57 point 3). Main fetches it and
// hands the renderer a data: URL - the renderer never gets an outside address (S2 2026-10-22 14:09).
//
// Every Etsy call counts against the app's daily allowance (D78), so a listing is asked for ONCE and kept:
// - a picture for a day, "the listing has no picture" for an hour, a failure (no key, Etsy away) for 10 minutes -
//   the bar asks again on every open and every poll, the cache is what keeps that from reaching Etsy;
// - two asks for the same listing at the same time share one fetch.
// The picture itself is fetched only from Etsy's image host, over https, as an image, and small.
// Everything is injected, so it runs in tests without Electron or the network.

export const THUMB_KEEP_MS = 24 * 60 * 60 * 1000;
export const THUMB_NONE_KEEP_MS = 60 * 60 * 1000;
export const THUMB_FAIL_KEEP_MS = 10 * 60 * 1000;
export const THUMB_MAX_BYTES = 300 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const LISTING_ID_RE = /^\d{1,20}$/;

// true only for https://<something>.etsystatic.com/... - the host Etsy serves listing images from.
export const isEtsyImageUrl = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname.endsWith(".etsystatic.com") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
};

export const createEtsyThumbnails = ({
  thumbnailUrl, // async (listingId) => the 75x75 address or null (client.listingThumbnailUrl)
  fetch, // async (url) => Response
  now = () => Date.now(),
  log = (line) => console.log(line),
}) => {
  const cache = new Map(); // listingId -> { image: string | null, until }
  const inFlight = new Map(); // listingId -> Promise<string | null>

  const download = async (url) => {
    if (!isEtsyImageUrl(url)) throw new Error("not an Etsy image address");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`the image answered ${response.status}`);
    const type = String(response.headers?.get?.("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw new Error(`not an image (${type || "no type"})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > THUMB_MAX_BYTES) throw new Error(`image of ${bytes.length} bytes`);
    return `data:${type};base64,${bytes.toString("base64")}`;
  };

  const load = async (listingId) => {
    try {
      const url = await thumbnailUrl(listingId);
      const image = url ? await download(url) : null;
      cache.set(listingId, { image, until: now() + (image ? THUMB_KEEP_MS : THUMB_NONE_KEEP_MS) });
      return image;
    } catch (err) {
      log(`[etsy-thumb] listing ${listingId}: ${err.message}`);
      cache.set(listingId, { image: null, until: now() + THUMB_FAIL_KEEP_MS });
      return null;
    }
  };

  // -> a data: URL, or null (no picture, not reachable now). Never throws for a well-formed number.
  return async (listingId) => {
    const id = typeof listingId === "string" ? listingId.trim() : "";
    if (!LISTING_ID_RE.test(id)) throw Object.assign(new Error("The Etsy listing is not named by its number."), { code: "INVALID_ETSY_LISTING", type: "Warning", title: "Etsy import" });
    const kept = cache.get(id);
    if (kept && kept.until > now()) return kept.image;
    if (inFlight.has(id)) return inFlight.get(id);
    const pending = load(id).finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
    return pending;
  };
};
