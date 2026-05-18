import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { LuX, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import style from "./PdfPreviewModal.module.css";

const PdfPreviewModal = ({
  isOpen,
  isLoading,
  imgSrc,
  error,
  currentPath,
  currentIndex,
  fileList,
  onClose,
  onNavigate,
}) => {
  const cardRef = useRef(null);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate("prev");
      if (e.key === "ArrowRight") onNavigate("next");
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, onNavigate]);

  // GSAP fade-in on open
  useEffect(() => {
    if (isOpen && cardRef.current) {
      gsap.fromTo(cardRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.15, ease: "power2.out" });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fileName = currentPath ? currentPath.replace(/\\/g, "/").split("/").pop() : "";
  const canNavigate = fileList && fileList.length > 1;

  return createPortal(
    <div className={style.backdrop} onClick={onClose}>
      <div
        ref={cardRef}
        className={style.card}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={style.header}>
          <span className={style.file_name} title={fileName}>
            {fileName}
          </span>
          <button type="button" className={style.close_btn} onClick={onClose} aria-label="Close preview">
            <LuX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={style.body}>
          {isLoading && (
            <div className={style.spinner_wrap}>
              <span className={style.spinner} />
            </div>
          )}
          {!isLoading && error && (
            <div className={style.error_wrap}>
              <span className={style.error_text}>{error}</span>
            </div>
          )}
          {!isLoading && imgSrc && (
            <img src={imgSrc} alt={fileName} className={style.preview_img} />
          )}
        </div>

        {/* Footer */}
        <div className={style.footer}>
          <button
            type="button"
            className={style.nav_btn}
            onClick={() => onNavigate("prev")}
            disabled={!canNavigate}
            aria-label="Previous file"
          >
            <LuChevronLeft size={18} />
          </button>
          <span className={style.counter}>
            {canNavigate ? `${currentIndex + 1} / ${fileList.length}` : "1 / 1"}
          </span>
          <button
            type="button"
            className={style.nav_btn}
            onClick={() => onNavigate("next")}
            disabled={!canNavigate}
            aria-label="Next file"
          >
            <LuChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PdfPreviewModal;
