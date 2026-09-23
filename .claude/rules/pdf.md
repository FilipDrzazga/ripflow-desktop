---
paths:
  - "src/ui/utils/pdfRender*.js"
  - "src/ui/hooks/usePdfPreview.js"
  - "src/ui/components/PdfThumb/**"
  - "src/ui/components/PdfPreviewModal/**"
---

## pdfRender.js — shared PDF rendering

`src/ui/utils/pdfRender.js` owns the whole renderer-side PDF path: IPC read → base64 → `Uint8Array` → `pdfjsLib.getDocument` → page 1 → canvas → JPEG data URL. **`pdfjsLib.GlobalWorkerOptions.workerSrc` is set here**, so any module that renders a PDF gets the worker by importing from this file rather than depending on `usePdfPreview` happening to be imported first.

```js
renderPdfToJpeg(filePath, { targetWidth = null, scale = 0.75, quality = 0.85 })  // → JPEG data URL
renderPdfThumb(filePath)   // → JPEG data URL at THUMB_WIDTH 160 / THUMB_QUALITY 0.5, QUEUED
clearPdfCache()            // drop every cached render, both maps (manual re-testing / tests)
```

**ALWAYS render thumbnails through `renderPdfThumb`.** `renderPdfToJpeg` with a `targetWidth` is the lower layer and is **not serialised** — reaching for it directly silently loses the queue and lets several ~850 ms main-thread renders collide.

- **`targetWidth` wins over `scale`** — when given, the scale is derived as `targetWidth / page.getViewport({ scale: 1 }).width` and the `scale` argument is ignored. Without it, `scale` is used directly.
- **Cache key encodes the REQUEST, not the resolved scale**: `` `${filePath}|${targetWidth != null ? `w${targetWidth}` : `s${scale}`}|${quality}` ``. Deliberate — the resolved scale is only known after `getDocument` + `getPage(1)`, i.e. after exactly the work the cache exists to skip, so keying on it would make the cache useless in `targetWidth` mode. For a given file the `targetWidth → scale` mapping is deterministic, so the request descriptor identifies the output image just as uniquely. A 200px thumbnail and a full preview of the same file therefore can never serve or evict each other.
- **Two separate LRU caches**, because the payloads differ by two orders of magnitude: `previewCache` (30 entries, several MB each) and `thumbCache` (200 entries, ~15 KB each, ≈3 MB total). Scrolling through thumbnails cannot flush the previews. `clearPdfCache()` empties both. The LRU get/set pair is one shared helper, not duplicated per map — reading refreshes recency, so eviction is least-recently-USED, not FIFO.
- **In-flight de-duplication** — `inFlight: Map` keyed exactly like the caches. A second caller asking for the same key while the first render is running gets the SAME promise instead of a second multi-MB SMB read (React StrictMode double-mounts, several cards asking at once). The entry is removed in `finally`, **including on rejection** — otherwise every later caller would inherit the failure instead of retrying. A failed render is likewise **never cached**.
- **`pdf.destroy()` runs in `finally`**, strictly after `page.render` settled — never before, which would tear the document down mid-render. A failing destroy is caught and logged so it cannot mask the render result. Canvas is released too (`canvas.width = 0`).
- **A concurrency-1 queue, for `renderPdfThumb` ONLY.** Rendering blocks the renderer's main thread (~400 ms for a 14 MB file), so parallel thumbnails freeze the UI in bursts. `renderPdfToJpeg` is deliberately **not** queued: a preview opened by hand must not wait behind a backlog of tiles. A `thumbCache` hit short-circuits the queue entirely and never joins the tail.
- Covered by `pdfRender.test.js` (node env, pdfjs + fileService mocked): de-duplication, cache isolation, LRU order, failure-not-cached, in-flight cleanup on failure, destroy lifecycle, queue serialisation.

## usePdfPreview Hook

- **Does not render** — it owns modal state only and delegates to `renderPdfToJpeg`, passing `PREVIEW_SCALE` 0.75 and `PREVIEW_QUALITY` 0.85 **explicitly** (pinned to the hook, so a future change to the module defaults cannot silently alter the preview)
- Shares the module-level LRU cache in `pdfRender.js` with every other caller
- Returns: `{ openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList }`
- `PdfPreviewModal` accepts `fileList: [{ path, name }]`; in BatchHistory skip `rolled_back` files
- `DataList` has its own instance — separate hook state, but the render cache is shared (a file previewed in DataList opens instantly in BatchHistory)
