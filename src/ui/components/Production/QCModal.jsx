import { useState } from "react";
import { createPortal } from "react-dom";
import { PRODUCTION_STAGE, QC_ACTION, SEWING_SUGGESTED_TYPES } from "../../../shared/constants";
import style from "./Production.module.css";

const TOGGLE_CYCLE = [QC_ACTION.PASS, QC_ACTION.SEWING];

const QCModal = ({ batchPath, files, onConfirm, onClose }) => {
  const sewingFiles     = files.filter((f) => f.stage === PRODUCTION_STAGE.TO_SEWING);
  const qcFiles         = files.filter((f) => f.stage === PRODUCTION_STAGE.QC);
  const hasSewingReturn = sewingFiles.length > 0;

  const [phase, setPhase] = useState(hasSewingReturn ? "sewing_return" : "qc");

  // QC decisions — fileId → { action: QC_ACTION, fromSewing: bool }
  const [qcChoices, setQcChoices] = useState(() => {
    const m = new Map();
    qcFiles.forEach((f) => m.set(f.file_id, { action: QC_ACTION.PASS, fromSewing: false }));
    return m;
  });

  // ─── Sewing return ────────────────────────────────────────────────────────

  const handleConfirmSewingReturn = () => {
    const newQcChoices = new Map(qcChoices);
    sewingFiles.forEach((f) => {
      newQcChoices.set(f.file_id, { action: QC_ACTION.PASS, fromSewing: true });
    });
    setQcChoices(newQcChoices);
    setPhase("qc");
  };

  // ─── QC helpers ───────────────────────────────────────────────────────────

  const toggleQcChoice = (fileId) => {
    setQcChoices((prev) => {
      const next    = new Map(prev);
      const cur     = next.get(fileId) ?? { action: QC_ACTION.PASS, fromSewing: false };
      const idx     = TOGGLE_CYCLE.indexOf(cur.action);
      const nextAct = TOGGLE_CYCLE[(idx + 1) % TOGGLE_CYCLE.length];
      next.set(fileId, { ...cur, action: nextAct });
      return next;
    });
  };

  // ─── Final confirm ────────────────────────────────────────────────────────

  const handleConfirmQC = () => {
    const decisions = [];
    qcChoices.forEach(({ action, fromSewing }, fileId) => {
      decisions.push({ fileId, action, fromSewing, reason: null });
    });
    onConfirm(decisions);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderQcFileRow = (file) => {
    const choice = qcChoices.get(file.file_id) ?? { action: QC_ACTION.PASS, fromSewing: false };
    const { action, fromSewing } = choice;
    const sewingSuggested = !fromSewing && SEWING_SUGGESTED_TYPES.includes(file.print_type);

    const toggleLabel = action === QC_ACTION.PASS
      ? (fromSewing ? "✓ received" : "✓ pass")
      : "✂ sewing";
    const toggleClass = action === QC_ACTION.PASS ? style.qc_toggle_pass : style.qc_toggle_sewing;

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
      </div>
    );
  };

  const batchName = batchPath?.split(/[/\\]/).pop() ?? "";

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
              {sewingFiles.map((f) => (
                <div key={f.file_id} className={style.qc_file_row}>
                  <div className={style.qc_file_info}>
                    <span className={`${style.qc_toggle} ${style.qc_toggle_pass}`}>✓ received</span>
                    <span className={style.qc_order}>{f.order_id ?? "—"}</span>
                    <span className={style.qc_customer}>{f.customer_name ?? "—"}</span>
                    {f.print_type && <span className={style.card_type_tag}>{f.print_type}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button type="button" className={style.modal_confirm} onClick={handleConfirmSewingReturn}>
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
            <p className={style.qc_legend}>Legend: ✓ pass &nbsp;✂ sewing</p>
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button type="button" className={style.modal_confirm} onClick={handleConfirmQC}>
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
