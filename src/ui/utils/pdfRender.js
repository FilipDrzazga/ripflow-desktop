import { readFileBuffer } from "../services/fileService";
import * as pdfjsLib from "pdfjs-dist";

// Worker setup lives with the rendering code — any module that renders a PDF gets
// it by importing from here, instead of depending on some other module having been
// imported first for the side effect.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

// Module-level LRU cache — survives component remounts; capped at 30 entries
const CACHE_LIMIT = 30;
const renderCache = new Map();

// The cache key carries the render parameters, not just the path — a 200px-wide
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

async function readFileAsUint8Array(filePath) {
  const result = await readFileBuffer(filePath);
  if (!result.success) throw new Error(result.error || "Failed to read file");
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Render page 1 of a PDF to a JPEG data URL.
 *
 * @param {string} filePath — path inside storagePath (read over IPC)
 * @param {object} [options]
 * @param {number|null} [options.targetWidth] — desired output width in px. When
 *        given, the scale is derived from the page's own width and `scale` is
 *        ignored.
 * @param {number} [options.scale=0.75] — render scale, used only when targetWidth
 *        is not given.
 * @param {number} [options.quality=0.85] — JPEG quality.
 * @returns {Promise<string>} JPEG data URL
 */
export async function renderPdfToJpeg(
  filePath,
  { targetWidth = null, scale = 0.75, quality = 0.85 } = {},
) {
  const key = cacheKeyFor(filePath, targetWidth, scale, quality);

  if (renderCache.has(key)) {
    // Refresh insertion order for LRU eviction
    const cached = renderCache.get(key);
    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }

  const data = await readFileAsUint8Array(filePath);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
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

  if (renderCache.size >= CACHE_LIMIT) {
    renderCache.delete(renderCache.keys().next().value);
  }
  renderCache.set(key, dataUrl);
  return dataUrl;
}

// Drop every cached render. Useful when manually re-testing render output without
// restarting the app.
export function clearPdfCache() {
  renderCache.clear();
}
