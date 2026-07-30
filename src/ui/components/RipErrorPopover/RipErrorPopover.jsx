import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { LuTriangleAlert, LuCopy, LuCheck, LuCircleCheck } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import style from "./RipErrorPopover.module.css";

const EDGE_OFFSET = 12;

// Local time HH:MM DD/MM/YYYY. No shared date helper exists in the repo (each component
// hand-rolls its own — formatRolledBackAt, formatStageDate, …), so this follows convention.
const formatRipTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${dd}/${mo}/${d.getFullYear()}`;
};

// Anchored popover showing one file's RIP-error detail. Positioning + backdrop-close lifted
// from ContextMenu (anchor edge-flip clamps; full-screen backdrop onPointerDown → onClose),
// but renders free-form content instead of the options[] menu. The caller portals this into
// document.body (matching how ContextMenu is portaled).
const RipErrorPopover = ({ error, anchorX, anchorY, onClose }) => {
  const boxRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const copyTimerRef = useRef(null);
  const resolveRipError = useStore((state) => state.resolveRipError);

  // Edge-flip clamp (same math as ContextMenu): keep the box inside the viewport.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const { innerWidth, innerHeight } = window;
    const { offsetWidth, offsetHeight } = box;
    let nextLeft = anchorX;
    let nextTop = anchorY;
    if (anchorX + offsetWidth + EDGE_OFFSET > innerWidth) {
      nextLeft = Math.max(EDGE_OFFSET, innerWidth - offsetWidth - EDGE_OFFSET);
    }
    if (anchorY + offsetHeight + EDGE_OFFSET > innerHeight) {
      nextTop = Math.max(EDGE_OFFSET, innerHeight - offsetHeight - EDGE_OFFSET);
    }
    box.style.left = `${nextLeft}px`;
    box.style.top = `${nextTop}px`;
  }, [anchorX, anchorY]);

  // Clear the "Copied!" revert timer on unmount.
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  if (!error) return null;

  const time = formatRipTime(error.detected_at);
  const fileId = error.file_id ?? "—";
  // Display value above carries an em-dash fallback — the backend key must be the raw stem
  // (rip_errors.file_id, same key clearFileStage uses) or nothing at all.
  const rawFileId =
    typeof error.file_id === "string" && error.file_id.trim() !== "" ? error.file_id : null;
  const message = error.error_message ?? "—";
  const node = error.failed_node ?? "—";

  const handleCopy = (e) => {
    // stopPropagation so the click neither hits the backdrop nor bubbles (through the React
    // portal tree) to the row's expand / select handler.
    e.stopPropagation();
    const block = `RIP Error\nFile: ${fileId}\nError: ${message}\nNode: ${node}\nTime: ${time}`;
    navigator.clipboard.writeText(block).then(() => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  // Manual resolve — the second resolve path next to rollback, for an error the operator has
  // dealt with without returning the file to the inbox (re-sent job, cleared RIP queue). The
  // store writes to the DB first and only drops the badge on success, so a failed write keeps
  // the popover open for a retry instead of hiding an error that is still open.
  const handleResolve = async (e) => {
    e.stopPropagation();
    if (isResolving || !rawFileId) return;
    setIsResolving(true);

    const res = await resolveRipError(rawFileId);
    if (res?.success) {
      notify(
        { type: "Success", title: "RIP error resolved", message: rawFileId },
        { stage: "rip-errors", code: "RIP_ERROR_RESOLVED" },
      );
      onClose(); // unmounts this popover — no state update after it
      return;
    }

    setIsResolving(false);
    notify(
      {
        type: "Error",
        title: "Resolve failed",
        message: res?.error?.message ?? "Could not resolve the RIP error.",
      },
      { stage: "rip-errors", code: res?.error?.code ?? "RIP_ERROR_RESOLVE_FAILED" },
    );
  };

  return (
    <>
      <div
        className={style.backdrop}
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      />
      <div
        ref={boxRef}
        className={style.popover}
        style={{ left: `${anchorX}px`, top: `${anchorY}px` }}
        role="dialog"
        aria-label="RIP error detail"
        // Clicks inside must not bubble through the portal to the row handlers.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={style.header}>
          <LuTriangleAlert size={14} />
          <span className={style.title}>RIP Error</span>
        </div>
        <dl className={style.fields}>
          <div className={style.field}><dt className={style.dt}>Error</dt><dd className={style.dd}>{message}</dd></div>
          <div className={style.field}><dt className={style.dt}>Node</dt><dd className={style.dd}>{node}</dd></div>
          <div className={style.field}><dt className={style.dt}>Time</dt><dd className={style.dd}>{time}</dd></div>
          <div className={style.field}><dt className={style.dt}>File</dt><dd className={`${style.dd} ${style.file_value}`}>{fileId}</dd></div>
        </dl>
        <div className={style.actions}>
          <button type="button" className={style.copy_btn} onClick={handleCopy}>
            {copied ? <LuCheck size={13} /> : <LuCopy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            className={style.resolve_btn}
            onClick={handleResolve}
            disabled={isResolving || !rawFileId}
            title={rawFileId ? "Mark this RIP error as resolved" : "No file id on this error"}
          >
            <LuCircleCheck size={13} />
            {isResolving ? "Resolving…" : "Resolved"}
          </button>
        </div>
      </div>
    </>
  );
};

export default RipErrorPopover;
