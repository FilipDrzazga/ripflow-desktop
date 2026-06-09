import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/useStore";
import { PRODUCTION_STAGE, QC_ACTION, SEWING_SUGGESTED_TYPES } from "../../../shared/constants";
import style from "./Production.module.css";

const TOGGLE_CYCLE = [QC_ACTION.PASS, QC_ACTION.SEWING, QC_ACTION.REJECT];

const QCModal = ({ batchPath, files, onConfirm, onClose }) => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);

  const sewingFiles  = files.filter((f) => f.stage === PRODUCTION_STAGE.TO_SEWING);
  const qcFiles      = files.filter((f) => f.stage === PRODUCTION_STAGE.QC);
  const hasSewingReturn = sewingFiles.length > 0;

  const [phase, setPhase] = useState(hasSewingReturn ? "sewing_return" : "qc");

  // Mode B: sewing return choices — fileId → 'received' | 'reject'
  const [sewingChoices, setSewingChoices] = useState(() => {
    const m = new Map();
    sewingFiles.forEach((f) => m.set(f.file_id, "received"));
    return m;
  });

  // Mode A: QC decisions — fileId → { action: QC_ACTION, fromSewing: bool }
  const [qcChoices, setQcChoices] = useState(() => {
    const m = new Map();
    qcFiles.forEach((f) => m.set(f.file_id, { action: QC_ACTION.PASS, fromSewing: false }));
    return m;
  });

  // Per-file reject reasons and OTHER text
  const [reasons,    setReasons]    = useState(new Map());
  const [otherTexts, setOtherTexts] = useState(new Map());

  // ─── Mode B helpers ───────────────────────────────────────────────────────

  const toggleSewingChoice = (fileId) => {
    setSewingChoices((prev) => {
      const next = new Map(prev);
      next.set(fileId, next.get(fileId) === "received" ? "reject" : "received");
      return next;
    });
  };

  const handleConfirmSewingReturn = () => {
    // Received sewing files advance to QC phase
    const newQcChoices = new Map(qcChoices);
    sewingFiles.forEach((f) => {
      if (sewingChoices.get(f.file_id) === "received") {
        newQcChoices.set(f.file_id, { action: QC_ACTION.PASS, fromSewing: true });
      }
    });
    setQcChoices(newQcChoices);
    setPhase("qc");
  };

  // ─── Mode A helpers ───────────────────────────────────────────────────────

  const toggleQcChoice = (fileId) => {
    setQcChoices((prev) => {
      const next    = new Map(prev);
      const cur     = next.get(fileId) ?? { action: QC_ACTION.PASS, fromSewing: false };
      const idx     = TOGGLE_CYCLE.indexOf(cur.action);
      const nextAct = TOGGLE_CYCLE[(idx + 1) % TOGGLE_CYCLE.length];
      next.set(fileId, { ...cur, action: nextAct });
      if (nextAct !== QC_ACTION.REJECT) {
        setReasons((r) => { const rn = new Map(r); rn.delete(fileId); return rn; });
      }
      return next;
    });
  };

  const handleReasonSelect = (fileId, def) => {
    setReasons((prev) => { const next = new Map(prev); next.set(fileId, { code: def.code, label: def.label }); return next; });
  };

  const setOtherText = (fileId, text) => {
    setOtherTexts((prev) => { const next = new Map(prev); next.set(fileId, text); return next; });
  };

  // ─── Validation ───────────────────────────────────────────────────────────

  const checkReasonReady = (fileId) => {
    const r = reasons.get(fileId);
    if (!r) return false;
    if (r.code === "OTHER") return (otherTexts.get(fileId) ?? "").trim().length > 0;
    return true;
  };

  const isConfirmReady = () => {
    for (const [fileId, { action }] of qcChoices) {
      if (action === QC_ACTION.REJECT && !checkReasonReady(fileId)) return false;
    }
    if (hasSewingReturn && phase === "qc") {
      for (const f of sewingFiles) {
        if (sewingChoices.get(f.file_id) === "reject" && !checkReasonReady(f.file_id)) return false;
      }
    }
    return true;
  };

  // ─── Final confirm ────────────────────────────────────────────────────────

  const resolveReason = (fileId) => {
    const r = reasons.get(fileId);
    if (!r) return null;
    return r.code === "OTHER"
      ? { code: "OTHER", label: otherTexts.get(fileId)?.trim() || "Other" }
      : r;
  };

  const handleConfirmQC = () => {
    if (!isConfirmReady()) return;
    const decisions = [];

    // Sewing return rejections (Phase 1)
    if (hasSewingReturn) {
      sewingFiles.forEach((f) => {
        if (sewingChoices.get(f.file_id) === "reject") {
          decisions.push({ fileId: f.file_id, action: QC_ACTION.REJECT, fromSewing: true, reason: resolveReason(f.file_id) });
        }
      });
    }

    // QC decisions (Phase 2)
    qcChoices.forEach(({ action, fromSewing }, fileId) => {
      decisions.push({
        fileId,
        action,
        fromSewing,
        reason: action === QC_ACTION.REJECT ? resolveReason(fileId) : null,
      });
    });

    onConfirm(decisions);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderReasonPicker = (fileId) => {
    const r = reasons.get(fileId);
    return (
      <div className={style.qc_reason_picker}>
        <div className={style.reason_pills}>
          {reasonDefinitions.map((def) => (
            <button
              key={def.code}
              type="button"
              className={`${style.pill} ${r?.code === def.code ? style.pill_active : ""}`}
              onClick={() => handleReasonSelect(fileId, def)}
            >
              {def.label}
            </button>
          ))}
        </div>
        {r?.code === "OTHER" && (
          <input
            className={style.other_input}
            placeholder="Describe the issue..."
            value={otherTexts.get(fileId) ?? ""}
            onChange={(e) => setOtherText(fileId, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  };

  const renderQcFileRow = (file) => {
    const choice     = qcChoices.get(file.file_id) ?? { action: QC_ACTION.PASS, fromSewing: false };
    const { action, fromSewing } = choice;
    const sewingSuggested = !fromSewing && SEWING_SUGGESTED_TYPES.includes(file.print_type);

    let toggleLabel, toggleClass;
    if (action === QC_ACTION.PASS) {
      toggleLabel = fromSewing ? "✓ received" : "✓ pass";
      toggleClass = style.qc_toggle_pass;
    } else if (action === QC_ACTION.SEWING) {
      toggleLabel = "✂ sewing";
      toggleClass = style.qc_toggle_sewing;
    } else {
      toggleLabel = "✕ reject";
      toggleClass = style.qc_toggle_reject;
    }

    return (
      <div key={file.file_id} className={style.qc_file_row}>
        <div className={style.qc_file_info}>
          <button type="button" className={`${style.qc_toggle} ${toggleClass}`} onClick={() => toggleQcChoice(file.file_id)}>
            {toggleLabel}
          </button>
          <span className={style.qc_order}>{file.order_id ?? "—"}</span>
          <span className={style.qc_customer}>{file.customer_name ?? "—"}</span>
          {file.print_type && (
            <span className={`${style.card_type_tag} ${sewingSuggested ? style.qc_sewing_hint : ""}`}>
              {file.print_type}{sewingSuggested ? " ✨" : ""}
            </span>
          )}
        </div>
        {action === QC_ACTION.REJECT && renderReasonPicker(file.file_id)}
      </div>
    );
  };

  const batchName = batchPath?.split(/[/\\]/).pop() ?? "";

  // All files currently displayed in QC phase
  const qcDisplayFiles = [...qcChoices.keys()]
    .map((id) => files.find((f) => f.file_id === id))
    .filter(Boolean);

  return createPortal(
    <>
      <div className={style.backdrop} onClick={onClose} />
      <div className={`${style.modal} ${style.qc_modal}`}>

        {phase === "sewing_return" ? (
          <>
            <h3 className={style.modal_title}>RETURNED FROM SEWING</h3>
            <p className={style.qc_subtitle}>Only showing items returned from sewing. Other files in this batch are already done.</p>
            <div className={style.qc_file_list}>
              {sewingFiles.map((f) => {
                const choice = sewingChoices.get(f.file_id) ?? "received";
                const isRejecting = choice === "reject";
                return (
                  <div key={f.file_id} className={style.qc_file_row}>
                    <div className={style.qc_file_info}>
                      <button
                        type="button"
                        className={`${style.qc_toggle} ${isRejecting ? style.qc_toggle_reject : style.qc_toggle_pass}`}
                        onClick={() => toggleSewingChoice(f.file_id)}
                      >
                        {isRejecting ? "✕ reject" : "✓ received"}
                      </button>
                      <span className={style.qc_order}>{f.order_id ?? "—"}</span>
                      <span className={style.qc_customer}>{f.customer_name ?? "—"}</span>
                      {f.print_type && <span className={style.card_type_tag}>{f.print_type}</span>}
                    </div>
                    {isRejecting && renderReasonPicker(f.file_id)}
                  </div>
                );
              })}
            </div>
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button
                type="button"
                className={style.modal_confirm}
                disabled={!sewingFiles.every((f) => sewingChoices.get(f.file_id) !== "reject" || checkReasonReady(f.file_id))}
                onClick={handleConfirmSewingReturn}
              >
                Confirm Received →
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className={style.modal_title}>QC — {batchName}</h3>
            <div className={style.qc_file_list}>
              {qcDisplayFiles.map((f) => renderQcFileRow(f))}
            </div>
            <p className={style.qc_legend}>Legend: ✓ pass &nbsp;✂ sewing &nbsp;✕ reject</p>
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button
                type="button"
                className={style.modal_confirm}
                disabled={!isConfirmReady()}
                onClick={handleConfirmQC}
              >
                Confirm QC →
              </button>
            </div>
          </>
        )}

      </div>
    </>,
    document.body,
  );
};

export default QCModal;
