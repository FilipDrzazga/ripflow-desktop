import { readFileBuffer } from "../services/fileService";
import * as pdfjsLib from "pdfjs-dist";

// Worker setup lives with the rendering code — any module that renders a PDF gets
// it by importing from here, instead of depending on some other module having been
// imported first for the side effect.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

// Thumbnail render parameters. Fixed on purpose: one shape for every thumbnail
// means one cache key per file and a predictable ~15 KB payload per entry.
export const THUMB_WIDTH = 160;
export const THUMB_QUALITY = 0.5;

// Two caches, because the payloads differ by two orders of magnitude: a full
// preview is several MB, a thumbnail ~15 KB. Sharing one limit let a scroll
// through thumbnails flush every preview out of memory.
const PREVIEW_CACHE_LIMIT = 30;
const THUMB_CACHE_LIMIT = 200; // ~3 MB at 15 KB/entry
const previewCache = new Map();
const thumbCache = new Map();

// Renders currently in progress, keyed exactly like the caches. Without this,
// two callers asking for the same file before the first finishes each pay for a
// full multi-MB read over SMB. Real cases: React StrictMode double-mounting in
// dev, and several cards asking for their thumbnail in the same tick.
const inFlight = new Map();

// The cache key carries the render parameters, not just the path — a 160px-wide
// thumbnail and a full-size preview of the same file are different images and must
// never evict or serve each other.
//
// It encodes the REQUEST (w<targetWidth> or s<scale>), not the resolved scale in
// width mode: the resolved scale is only known after the PDF is parsed, which is
// the expensive part we are trying to skip. For a given file the mapping
// targetWidth -> scale is deterministic, so the request descriptor identifies the
// resulting image exactly as well.
const cacheKeyFor = (filePath, targetWidth, scale, quality) =>
  `${filePath}|${targetWidth != null ? `w${targetWidth}` : `s${scale}`}|${quality}`;

// ── Shared LRU helpers — one implementation for both maps ────────────────────

// Reading refreshes insertion order, which is what makes eviction least-recently-
// USED rather than least-recently-written.
const cacheGet = (cache, key) => {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
};

const cacheSet = (cache, key, value, limit) => {
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value);
};

async function readFileAsUint8Array(filePath) {
  const result = await readFileBuffer(filePath);
  if (!result.success) throw new Error(result.error || "Failed to read file");
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function renderToDataUrl(filePath, { targetWidth, scale, quality }) {
  const data = await readFileAsUint8Array(filePath);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  try {
    const page = await pdf.getPage(1);

    const effectiveScale =
      targetWidth != null ? targetWidth / page.getViewport({ scale: 1 }).width : scale;

    const viewport = page.getViewport({ scale: effectiveScale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    // Release GPU-backed canvas memory
    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
  } finally {
    // pdfjs keeps worker-side structures alive until an explicit destroy, so a
    // session that renders dozens of documents grows without this. It runs in
    // finally — i.e. strictly AFTER page.render resolved or threw, never before,
    // which would tear the document down mid-render. A failing destroy must not
    // mask the render result, hence the swallow-and-log.
    try {
      await pdf.destroy();
    } catch (err) {
      console.error("[pdfRender] pdf.destroy failed:", err);
    }
  }
}

/**
 * Render page 1 of a PDF to a JPEG data URL.
 *
 * NOT queued — a full preview is a direct answer to a click and must never wait
 * behind a backlog of thumbnails. Only renderPdfThumb is serialised; see there.
 *
 * @param {string} filePath — path inside storagePath (read over IPC)
 * @param {object} [options]
 * @param {number|null} [options.targetWidth] — desired output width in px. When
 *        given, the scale is derived from the page's own width, `scale` is
 *        ignored, and the result goes to the thumbnail cache.
 * @param {number} [options.scale=0.75] — render scale, used only when targetWidth
 *        is not given.
 * @param {number} [options.quality=0.85] — JPEG quality.
 * @returns {Promise<string>} JPEG data URL
 */
export async function renderPdfToJpeg(
  filePath,
  { targetWidth = null, scale = 0.75, quality = 0.85 } = {},
) {
  const isThumb = targetWidth != null;
  const cache = isThumb ? thumbCache : previewCache;
  const limit = isThumb ? THUMB_CACHE_LIMIT : PREVIEW_CACHE_LIMIT;
  const key = cacheKeyFor(filePath, targetWidth, scale, quality);

  const cached = cacheGet(cache, key);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  // The async IIFE runs synchronously up to its first await, so the map entry is
  // registered before any other caller can observe the gap.
  const task = (async () => {
    const dataUrl = await renderToDataUrl(filePath, { targetWidth, scale, quality });
    // Only a successful render is cached — a failure must be retryable, never
    // remembered as the answer for the rest of the session.
    cacheSet(cache, key, dataUrl, limit);
    return dataUrl;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    // Also on rejection: leaving a settled-rejected promise here would hand the
    // same failure to every later caller instead of letting them retry.
    inFlight.delete(key);
  }
}

// ── Thumbnail queue — concurrency 1 ──────────────────────────────────────────
// Rendering blocks the renderer's main thread (~400 ms for a 14 MB file), so
// letting several thumbnails render at once freezes the UI in bursts. One at a
// time keeps the app responsive between jobs. Deliberately NOT applied to
// renderPdfToJpeg: a preview opened by hand must not queue behind thumbnails.
const thumbQueue = [];
let thumbRunning = false;

const pumpThumbQueue = () => {
  if (thumbRunning) return;
  const next = thumbQueue.shift();
  if (!next) return;
  thumbRunning = true;
  next
    .run()
    .then(next.resolve, next.reject)
    .finally(() => {
      thumbRunning = false;
      pumpThumbQueue();
    });
};

const enqueueThumb = (run) =>
  new Promise((resolve, reject) => {
    thumbQueue.push({ run, resolve, reject });
    pumpThumbQueue();
  });

/**
 * Render a fixed-size thumbnail of page 1, serialised through the thumbnail
 * queue. A cache hit short-circuits the queue entirely — an already-rendered
 * thumbnail never waits behind pending work.
 *
 * @param {string} filePath — path inside storagePath
 * @returns {Promise<string>} JPEG data URL
 */
export function renderPdfThumb(filePath) {
  const key = cacheKeyFor(filePath, THUMB_WIDTH, null, THUMB_QUALITY);
  const cached = cacheGet(thumbCache, key);
  if (cached !== undefined) return Promise.resolve(cached);

  return enqueueThumb(() =>
    renderPdfToJpeg(filePath, { targetWidth: THUMB_WIDTH, quality: THUMB_QUALITY }),
  );
}

// Drop every cached render (both maps). Useful when manually re-testing render
// output without restarting the app, and to isolate tests from each other.
export function clearPdfCache() {
  previewCache.clear();
  thumbCache.clear();
}
