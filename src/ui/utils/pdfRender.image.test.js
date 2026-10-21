import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// E3a-2: pdfRender.js also draws an image tile (the Etsy route) - jpg / png / gif / webp through the browser's
// own decoder, with the longest side capped; a TIFF has no preview. The same caches, queue and in-flight
// de-duplication as for a PDF (pdfRender.test.js) apply, since the image branch sits below them. pdfjs and the
// IPC file service are neutralised; the canvas and createImageBitmap are stubs that record what was asked.

const mocks = vi.hoisted(() => ({
  readFileBuffer: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock("../services/fileService", () => ({ readFileBuffer: mocks.readFileBuffer }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: { workerSrc: "" }, getDocument: mocks.getDocument }));

import { renderPdfToJpeg, renderPdfThumb, clearPdfCache, THUMB_WIDTH } from "./pdfRender.js";

let canvases;
let bitmaps;
let bitmapSize;
let drawFails;

beforeEach(() => {
  clearPdfCache();
  mocks.readFileBuffer.mockReset();
  mocks.getDocument.mockReset();
  mocks.readFileBuffer.mockResolvedValue({ success: true, data: "AA==" });
  canvases = [];
  bitmaps = [];
  bitmapSize = { width: 1000, height: 500 };
  drawFails = false;

  globalThis.createImageBitmap = vi.fn(async () => {
    const bitmap = { ...bitmapSize, close: vi.fn() };
    bitmaps.push(bitmap);
    return bitmap;
  });
  globalThis.document = {
    createElement: () => {
      const calls = [];
      const canvas = {
        width: 0,
        height: 0,
        calls,
        getContext: () => ({
          set fillStyle(v) {
            calls.push(["fillStyle", v]);
          },
          fillRect: (...a) => calls.push(["fillRect", ...a]),
          drawImage: (...a) => {
            if (drawFails) throw new Error("draw failed");
            calls.push(["drawImage", ...a.slice(1)]);
          },
        }),
        toDataURL: (type, quality) => {
          canvas.sizeAtExport = [canvas.width, canvas.height];
          return `data:${type};q${quality};IMG`;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
});

afterEach(() => {
  delete globalThis.createImageBitmap;
  delete globalThis.document;
});

describe("pdfRender - image tiles", () => {
  it.each(["a.jpg", "a.jpeg", "a.png", "a.gif", "a.webp", "A.PNG"])("%s is decoded by the browser, never by pdfjs", async (name) => {
    const url = await renderPdfToJpeg(`O:\\x\\${name}`);

    expect(url).toMatch(/^data:image\/jpeg;q0\.85/);
    expect(globalThis.createImageBitmap).toHaveBeenCalledTimes(1);
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);
  });

  it("a PDF still goes to pdfjs, not to the image decoder", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error("pdfjs reached")) });
    await expect(renderPdfToJpeg("O:\\x\\a.pdf")).rejects.toThrow("pdfjs reached");
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("a TIFF has no preview: it rejects before the file is read, and is not cached", async () => {
    await expect(renderPdfToJpeg("O:\\x\\a.tif")).rejects.toThrow(/No preview/);
    await expect(renderPdfThumb("O:\\x\\b.TIFF")).rejects.toThrow(/No preview/);
    expect(mocks.readFileBuffer).not.toHaveBeenCalled();
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("the thumbnail is THUMB_WIDTH wide with the image's proportions", async () => {
    await renderPdfThumb("O:\\x\\a.png");
    expect(canvases[0].sizeAtExport).toEqual([THUMB_WIDTH, THUMB_WIDTH / 2]);
  });

  it("the preview scale applies, and the longest side is capped at 2000 px", async () => {
    await renderPdfToJpeg("O:\\x\\small.png", { scale: 0.75 });
    expect(canvases[0].sizeAtExport).toEqual([750, 375]);

    bitmapSize = { width: 8000, height: 6000 };
    await renderPdfToJpeg("O:\\x\\big.png", { scale: 0.75 });
    expect(canvases[1].sizeAtExport).toEqual([2000, 1500]);
  });

  it("paints white first, so a transparent PNG does not turn black as a JPEG", async () => {
    await renderPdfToJpeg("O:\\x\\a.png");
    const [first, second, third] = canvases[0].calls;
    expect(first).toEqual(["fillStyle", "#ffffff"]);
    expect(second[0]).toBe("fillRect");
    expect(third[0]).toBe("drawImage");
  });

  it("releases the bitmap even when drawing fails, and a failure is not cached", async () => {
    drawFails = true;
    await expect(renderPdfToJpeg("O:\\x\\a.png")).rejects.toThrow("draw failed");
    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);

    drawFails = false;
    await expect(renderPdfToJpeg("O:\\x\\a.png")).resolves.toMatch(/^data:image\/jpeg/);
  });

  it("is read through IPC once and then served from the cache", async () => {
    await renderPdfToJpeg("O:\\x\\a.png");
    await renderPdfToJpeg("O:\\x\\a.png");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);
  });
});
