import { useState, useEffect } from "react";
import { LuImageOff } from "react-icons/lu";
import { renderPdfThumb } from "../../utils/pdfRender";
import style from "./PdfThumb.module.css";

/**
 * Page-1 thumbnail of a PDF, in a fixed-size box.
 *
 * Always goes through renderPdfThumb — NEVER renderPdfToJpeg with a targetWidth.
 * The latter is the lower layer and is not serialised, so calling it directly
 * would silently lose the concurrency-1 queue and let several ~850 ms renders
 * fight over the main thread at once.
 */
const PdfThumb = ({ filePath }) => {
  // The result carries the path it belongs to. That is what discards the previous
  // image the instant filePath changes — a render takes ~850 ms, and without it
  // the pattern of the previously selected order would hang under the new row for
  // the whole time. Storing the path instead of clearing state in the effect body
  // also keeps this out of the cascading-render trap (react-hooks/set-state-in-effect).
  const [result, setResult] = useState(null); // { path, src } | { path, error }

  useEffect(() => {
    if (!filePath) return undefined;
    let cancelled = false;

    renderPdfThumb(filePath)
      .then((dataUrl) => {
        // Checked AFTER the await: by now the operator may have clicked another
        // order, unmounting this card or pointing it at a different file.
        if (!cancelled) setResult({ path: filePath, src: dataUrl });
      })
      .catch((err) => {
        // Deliberately silent — no notify(), no red. Some batches currently fail
        // with ERR_PATH_NOT_ALLOWED because of an unrelated storage-root format
        // problem in the DB (~8% of to_sewing rows), and three tiles would mean
        // three error toasts on every order click. The console keeps the detail.
        console.error("[PdfThumb] render failed:", filePath, err);
        if (!cancelled) setResult({ path: filePath, error: err?.message || "Render failed" });
      });

    return () => { cancelled = true; };
  }, [filePath]);

  if (!filePath) {
    return (
      <div className={style.fallback} title="Preview unavailable: no file path">
        <LuImageOff size={20} />
      </div>
    );
  }

  // Anything belonging to an earlier path is ignored, so a stale image is never
  // shown under a newly selected item.
  const current = result?.path === filePath ? result : null;

  if (current?.src) {
    return <img className={style.image} src={current.src} alt="" draggable={false} />;
  }

  if (current?.error) {
    return (
      <div className={style.fallback} title={`Preview unavailable: ${current.error}`}>
        <LuImageOff size={20} />
      </div>
    );
  }

  return <div className={style.skeleton} />;
};

export default PdfThumb;
