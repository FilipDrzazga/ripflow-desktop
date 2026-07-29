import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// pdfjs-dist and the IPC file service are the only two things pdfRender touches
// that reach outside the process. Both are neutralised here so the tests exercise
// caching / de-duplication / queueing logic without a worker, a canvas or a disk.
const mocks = vi.hoisted(() => ({
  readFileBuffer: vi.fn(),
  getDocument: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../services/fileService", () => ({
  readFileBuffer: mocks.readFileBuffer,
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: mocks.getDocument,
}));

import {
  renderPdfToJpeg,
  renderPdfThumb,
  clearPdfCache,
  THUMB_WIDTH,
  THUMB_QUALITY,
} from "./pdfRender.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const OK_BUFFER = { success: true, data: "AA==" };

let dataUrlCounter = 0;

beforeEach(() => {
  clearPdfCache();
  mocks.readFileBuffer.mockReset();
  mocks.getDocument.mockReset();
  mocks.destroy.mockReset();
  dataUrlCounter = 0;

  mocks.readFileBuffer.mockResolvedValue(OK_BUFFER);

  mocks.destroy.mockResolvedValue(undefined);
  mocks.getDocument.mockImplementation(() => ({
    promise: Promise.resolve({
      destroy: mocks.destroy,
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 1000 * scale, height: 500 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }));

  // Minimal canvas stub — the render path only sets width/height, asks for a 2d
  // context and calls toDataURL. Each call returns a distinct value so a cached
  // result is distinguishable from a freshly rendered one.
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({}),
      toDataURL: () => `data:image/jpeg;base64,IMG${++dataUrlCounter}`,
    }),
  };
});

afterEach(() => {
  delete globalThis.document;
});

describe("pdfRender — in-flight de-duplication", () => {
  it("collapses two parallel calls for the same key into ONE readFileBuffer", async () => {
    const gate = deferred();
    mocks.readFileBuffer.mockReturnValueOnce(gate.promise);

    const a = renderPdfToJpeg("O:\\x\\same.pdf");
    const b = renderPdfToJpeg("O:\\x\\same.pdf");
    await tick();

    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);

    gate.resolve(OK_BUFFER);
    const [resA, resB] = await Promise.all([a, b]);

    expect(resA).toBe(resB);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);
  });

  it("does NOT collapse different keys", async () => {
    await Promise.all([
      renderPdfToJpeg("O:\\x\\one.pdf"),
      renderPdfToJpeg("O:\\x\\two.pdf"),
    ]);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);
  });

  it("keeps preview and thumbnail of the SAME file apart", async () => {
    await renderPdfToJpeg("O:\\x\\a.pdf");
    await renderPdfToJpeg("O:\\x\\a.pdf", { targetWidth: THUMB_WIDTH, quality: THUMB_QUALITY });
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);
  });
});

describe("pdfRender — cache hits", () => {
  it("serves a repeat call from cache without touching readFileBuffer", async () => {
    const first = await renderPdfToJpeg("O:\\x\\a.pdf");
    const second = await renderPdfToJpeg("O:\\x\\a.pdf");

    expect(second).toBe(first);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);
  });

  it("serves a repeat renderPdfThumb from cache and skips the queue", async () => {
    const first = await renderPdfThumb("O:\\x\\a.pdf");
    const second = await renderPdfThumb("O:\\x\\a.pdf");

    expect(second).toBe(first);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("pdfRender — the two caches are independent", () => {
  it("201 thumbnails do NOT evict a preview entry", async () => {
    const preview = await renderPdfToJpeg("O:\\x\\preview.pdf");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 201; i++) {
      await renderPdfToJpeg(`O:\\x\\thumb-${i}.pdf`, {
        targetWidth: THUMB_WIDTH,
        quality: THUMB_QUALITY,
      });
    }
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(202);

    const again = await renderPdfToJpeg("O:\\x\\preview.pdf");
    expect(again).toBe(preview);
    // Still 202: the preview came from cache, it was never re-read.
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(202);
  });
});

describe("pdfRender — LRU eviction order", () => {
  it("evicts the OLDEST preview entry, not an arbitrary one", async () => {
    for (let i = 0; i < 30; i++) await renderPdfToJpeg(`O:\\x\\p${i}.pdf`);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(30);

    // 31st entry pushes the limit of 30 and must drop p0 (least recently used).
    await renderPdfToJpeg("O:\\x\\p30.pdf");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(31);

    // p1 is still cached -> no new read.
    await renderPdfToJpeg("O:\\x\\p1.pdf");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(31);

    // p0 was evicted -> it must be read again.
    await renderPdfToJpeg("O:\\x\\p0.pdf");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(32);
  });

  it("a cache hit refreshes recency, so the refreshed entry survives eviction", async () => {
    for (let i = 0; i < 30; i++) await renderPdfToJpeg(`O:\\x\\q${i}.pdf`);

    // Touch q0 so q1 becomes the least recently used entry.
    await renderPdfToJpeg("O:\\x\\q0.pdf");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(30);

    await renderPdfToJpeg("O:\\x\\q30.pdf"); // 31st -> evicts q1, not q0
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(31);

    await renderPdfToJpeg("O:\\x\\q0.pdf"); // still cached
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(31);

    await renderPdfToJpeg("O:\\x\\q1.pdf"); // evicted -> re-read
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(32);
  });
});

describe("pdfRender — failures are never cached and never poison the path", () => {
  it("does NOT cache a failed render — the next call retries", async () => {
    mocks.readFileBuffer.mockResolvedValueOnce({ success: false, error: "NAS down" });

    await expect(renderPdfToJpeg("O:\\x\\bad.pdf")).rejects.toThrow("NAS down");
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);

    const ok = await renderPdfToJpeg("O:\\x\\bad.pdf");
    expect(ok).toMatch(/^data:image\/jpeg/);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);
  });

  it("removes the in-flight entry on failure so a later caller is not handed the rejection", async () => {
    const gate = deferred();
    mocks.readFileBuffer.mockReturnValueOnce(gate.promise);

    const failing = renderPdfToJpeg("O:\\x\\boom.pdf");
    await tick();
    gate.reject(new Error("read exploded"));
    await expect(failing).rejects.toThrow("read exploded");

    // A brand new attempt must run for real instead of reusing the rejected promise.
    const retry = await renderPdfToJpeg("O:\\x\\boom.pdf");
    expect(retry).toMatch(/^data:image\/jpeg/);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);
  });

  it("a destroy failure does not fail the render", async () => {
    mocks.destroy.mockRejectedValueOnce(new Error("worker gone"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await renderPdfToJpeg("O:\\x\\a.pdf");

    expect(result).toMatch(/^data:image\/jpeg/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("pdfRender — document lifecycle", () => {
  it("destroys the document after every render", async () => {
    await renderPdfToJpeg("O:\\x\\a.pdf");
    await renderPdfToJpeg("O:\\x\\b.pdf");
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
  });

  it("destroys the document even when the render throws", async () => {
    mocks.getDocument.mockImplementationOnce(() => ({
      promise: Promise.resolve({
        destroy: mocks.destroy,
        getPage: async () => ({
          getViewport: ({ scale }) => ({ width: 1000 * scale, height: 500 * scale }),
          render: () => ({ promise: Promise.reject(new Error("render died")) }),
        }),
      }),
    }));

    await expect(renderPdfToJpeg("O:\\x\\a.pdf")).rejects.toThrow("render died");
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("renderPdfThumb — queue with concurrency 1", () => {
  it("starts the second job only after the first one finished", async () => {
    const first = deferred();
    const second = deferred();
    mocks.readFileBuffer
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const a = renderPdfThumb("O:\\x\\a.pdf");
    const b = renderPdfThumb("O:\\x\\b.pdf");
    await tick();

    // Second job is still queued — nothing of it has run yet.
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);

    first.resolve(OK_BUFFER);
    await a;
    await tick();

    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);

    second.resolve(OK_BUFFER);
    await expect(b).resolves.toMatch(/^data:image\/jpeg/);
  });

  it("a failed job releases the queue for the next one", async () => {
    const first = deferred();
    mocks.readFileBuffer.mockReturnValueOnce(first.promise);

    const a = renderPdfThumb("O:\\x\\a.pdf");
    const b = renderPdfThumb("O:\\x\\b.pdf");
    await tick();

    first.reject(new Error("first died"));
    await expect(a).rejects.toThrow("first died");

    await expect(b).resolves.toMatch(/^data:image\/jpeg/);
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(2);
  });

  it("uses the fixed thumbnail parameters", async () => {
    await renderPdfThumb("O:\\x\\a.pdf");
    // Same key as an explicit call with the exported constants -> cache hit.
    await renderPdfToJpeg("O:\\x\\a.pdf", { targetWidth: THUMB_WIDTH, quality: THUMB_QUALITY });
    expect(mocks.readFileBuffer).toHaveBeenCalledTimes(1);
  });
});
