import { useState, useCallback, useRef } from "react";
import { readFileBuffer } from "../services/fileService";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

// Module-level LRU cache — survives component remounts; capped at 30 entries
const CACHE_LIMIT = 30;
const previewCache = new Map();

async function readFileAsUint8Array(filePath) {
  const result = await readFileBuffer(filePath);
  if (!result.success) throw new Error(result.error || "Failed to read file");
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function renderFirstPageToJpeg(filePath) {
  if (previewCache.has(filePath)) {
    // Refresh insertion order for LRU eviction
    const cached = previewCache.get(filePath);
    previewCache.delete(filePath);
    previewCache.set(filePath, cached);
    return cached;
  }

  const data = await readFileAsUint8Array(filePath);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 0.75 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // Release GPU-backed canvas memory
  canvas.width = 0;
  canvas.height = 0;

  if (previewCache.size >= CACHE_LIMIT) {
    previewCache.delete(previewCache.keys().next().value);
  }
  previewCache.set(filePath, dataUrl);
  return dataUrl;
}

export function usePdfPreview() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [imgSrc, setImgSrc] = useState(null);
  const [currentPath, setCurrentPath] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);

  const fileListRef = useRef([]);
  const currentIndexRef = useRef(0);

  const loadFile = useCallback(async (filePath, index) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setCurrentPath(filePath);
    setIsLoading(true);
    setError(null);
    setImgSrc(null);
    try {
      const dataUrl = await renderFirstPageToJpeg(filePath);
      setImgSrc(dataUrl);
    } catch (err) {
      console.error("[usePdfPreview] render error:", err);
      setError("Preview unavailable — file may have been moved or rolled back");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openPreview = useCallback(
    (filePath, fileList) => {
      fileListRef.current = fileList || [];
      const idx = fileList ? fileList.findIndex((f) => f.path === filePath) : 0;
      const resolvedIdx = idx >= 0 ? idx : 0;
      setIsOpen(true);
      loadFile(filePath, resolvedIdx);
    },
    [loadFile],
  );

  const closePreview = useCallback(() => {
    setIsOpen(false);
    setImgSrc(null);
    setError(null);
    setCurrentPath(null);
  }, []);

  const navigate = useCallback(
    (direction) => {
      const list = fileListRef.current;
      if (!list || list.length <= 1) return;
      const prev = currentIndexRef.current;
      const next =
        direction === "next"
          ? (prev + 1) % list.length
          : (prev - 1 + list.length) % list.length;
      loadFile(list[next].path, next);
    },
    [loadFile],
  );

  return {
    openPreview,
    closePreview,
    navigate,
    isOpen,
    isLoading,
    imgSrc,
    currentPath,
    currentIndex,
    error,
    fileList: fileListRef.current,
  };
}
