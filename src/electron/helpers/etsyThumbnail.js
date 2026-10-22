// The small picture of an Etsy listing for the Inbox bar (FILIP 2026-10-22, list 12:57 point 3). Main fetches it and
// hands the renderer a data: URL - the renderer never gets an outside address (S2 2026-10-22 14:09).
//
// Every Etsy call counts against the app's daily allowance (D78), so a listing is asked for ONCE and kept:
// - a picture for a day, "the listing has no picture" for an hour, a failure (no key, Etsy away) for 10 minutes -
//   the bar asks again on every open and every poll, the cache is what keeps that from reaching Etsy;
// - two asks for the same listing at the same time share one fetch.
// The picture itself is fetched only from Etsy's image host (every redirect hop checked), over https, as an image,
// and small (cut while reading). A listing Etsy answers 404 for is "no picture" for a day.
// Everything is injected, so it runs in tests without Electron or the network.

export const THUMB_KEEP_MS = 24 * 60 * 60 * 1000;
export const THUMB_NONE_KEEP_MS = 60 * 60 * 1000;
export const THUMB_FAIL_KEEP_MS = 10 * 60 * 1000;
export const THUMB_MAX_BYTES = 300 * 1024;
export const THUMB_MAX_REDIRECTS = 3;
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

  // Redirects are followed by hand, so EVERY address on the way is checked against Etsy's image host (D79) - an
  // automatic follow would check only the first.
  const fetchImage = async (url) => {
    let current = url;
    for (let hop = 0; hop <= THUMB_MAX_REDIRECTS; hop += 1) {
      if (!isEtsyImageUrl(current)) throw new Error("not an Etsy image address");
      const response = await fetch(current, { redirect: "manual" });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers?.get?.("location");
      if (!location) throw new Error(`the image answered ${response.status} without an address`);
      current = new URL(location, current).toString();
    }
    throw new Error("too many redirects");
  };

  // The body, read only up to the cap (D79): a declared size over it is refused before reading, a stream is cut
  // the moment it passes it.
  const readCapped = async (response) => {
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > THUMB_MAX_BYTES) throw new Error(`image of ${declared} bytes`);
    const reader = response.body?.getReader?.();
    if (!reader) return Buffer.from(await response.arrayBuffer());
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > THUMB_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`image over ${THUMB_MAX_BYTES} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  };

  const download = async (url) => {
    const response = await fetchImage(url);
    if (!response.ok) throw new Error(`the image answered ${response.status}`);
    const type = String(response.headers?.get?.("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw new Error(`not an image (${type || "no type"})`);
    const bytes = await readCapped(response);
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
      // A listing Etsy no longer has (deleted, deactivated) will not grow a picture: "none" for a day, not a
      // failure asked again every 10 minutes on every station (D79).
      if (err?.status === 404) {
        cache.set(listingId, { image: null, until: now() + THUMB_KEEP_MS });
        return null;
      }
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
