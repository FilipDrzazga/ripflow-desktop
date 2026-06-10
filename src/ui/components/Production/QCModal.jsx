import { useState } from "react";
import { createPortal } from "react-dom";
import { LuFileText, LuScissors } from "react-icons/lu";
import { PRODUCTION_STAGE, QC_ACTION, SEWING_SUGGESTED_TYPES } from "../../../shared/constants";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
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

    if (qcFiles.length === 0) {
      const decisions = [];
      newQcChoices.forEach(({ action, fromSewing }, fileId) => {
        decisions.push({ fileId, action, fromSewing, reason: null });
      });
      onConfirm(decisions);
    } else {
      setQcChoices(newQcChoices);
      setPhase("qc");
    }
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
    const canToggleSewing = !fromSewing && SEWING_SUGGESTED_TYPES.includes(file.print_type);
    const printTypeDef = PRINT_TYPE_MAP[file.print_type];

    const toggleLabel = action === QC_ACTION.PASS
      ? (fromSewing ? "✓ received" : "✓ pass")
      : "✂ sewing";
    const toggleClass = action === QC_ACTION.PASS ? style.qc_toggle_pass : style.qc_toggle_sewing;

    return (
      <div key={file.file_id} className={style.card} style={{ margin: "3px 0" }}>
        {canToggleSewing ? (
          <button type="button" className={`${style.qc_toggle} ${toggleClass}`} onClick={() => toggleQcChoice(file.file_id)}>
            {toggleLabel}
          </button>
        ) : (
          <span className={`${style.qc_toggle} ${style.qc_toggle_pass}`}>{toggleLabel}</span>
        )}
        <LuFileText className={style.card_file_icon} />
        <div className={style.card_info}>
          <span className={style.card_order}>{file.order_id ?? "—"}</span>
          <span className={style.card_customer}>{file.customer_name ?? "—"}</span>
          {printTypeDef ? (
            <span className={style.card_type_tag}>
              <printTypeDef.Icon size={16} style={{ color: printTypeDef.color }} />
              {printTypeDef.label}
            </span>
          ) : file.print_type ? (
            <span className={style.card_type_tag}>{file.print_type}</span>
          ) : null}
          {file.print_type === "LM"
            ? file.meters != null && <span className={style.card_meters}>{file.meters}m</span>
            : file.qty != null && <span className={style.card_meters}>{file.qty} szt.</span>
          }
        </div>
        {canToggleSewing && <span className={style.qc_sewing_end}><LuScissors size={15} /></span>}
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
              {sewingFiles.map((f) => {
                const printTypeDef = PRINT_TYPE_MAP[f.print_type];
                return (
                  <div key={f.file_id} className={style.card} style={{ margin: "3px 0" }}>
                    <span className={`${style.qc_toggle} ${style.qc_toggle_pass}`}>✓ received</span>
                    <LuFileText className={style.card_file_icon} />
                    <div className={style.card_info}>
                      <span className={style.card_order}>{f.order_id ?? "—"}</span>
                      <span className={style.card_customer}>{f.customer_name ?? "—"}</span>
                      {printTypeDef ? (
                        <span className={style.card_type_tag}>
                          <printTypeDef.Icon size={16} style={{ color: printTypeDef.color }} />
                          {printTypeDef.label}
                        </span>
                      ) : f.print_type ? (
                        <span className={style.card_type_tag}>{f.print_type}</span>
                      ) : null}
                      {f.print_type === "LM"
                        ? f.meters != null && <span className={style.card_meters}>{f.meters}m</span>
                        : f.qty != null && <span className={style.card_meters}>{f.qty} szt.</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button type="button" className={style.modal_confirm} onClick={handleConfirmSewingReturn}>
                Confirm Received
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className={style.modal_title}>{batchName}</h3>
            <div className={style.qc_file_list}>
              {qcDisplayFiles.map((f) => renderQcFileRow(f))}
            </div>
<div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
              <button type="button" className={style.modal_confirm} onClick={handleConfirmQC}>
                Confirm
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
