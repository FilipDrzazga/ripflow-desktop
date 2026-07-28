import { useState, useCallback, useRef } from "react";
import { renderPdfToJpeg } from "../utils/pdfRender";

// Full-size preview render parameters — passed explicitly so they stay pinned to
// this hook rather than riding on the shared module's defaults.
const PREVIEW_SCALE = 0.75;
const PREVIEW_QUALITY = 0.85;

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
      const dataUrl = await renderPdfToJpeg(filePath, {
        scale: PREVIEW_SCALE,
        quality: PREVIEW_QUALITY,
      });
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
