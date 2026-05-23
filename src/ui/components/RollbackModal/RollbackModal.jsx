import { useState } from "react";
import { createPortal } from "react-dom";
import { ROLLBACK_REASONS } from "@/constants/rollbackReasons";
import style from "./RollbackModal.module.css";

const RollbackModal = ({ batchName, onConfirm, onCancel }) => {
  const [selectedReason, setSelectedReason] = useState(null);
  const [otherText, setOtherText] = useState("");

  const isConfirmEnabled = selectedReason !== null && (selectedReason.code !== "OTHER" || otherText.trim().length > 0);

  const handleConfirm = () => {
    if (!isConfirmEnabled) return;
    onConfirm(
      selectedReason.code === "OTHER"
        ? { code: "OTHER", label: otherText.trim() }
        : { code: selectedReason.code, label: selectedReason.label },
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && isConfirmEnabled) handleConfirm();
  };

  return createPortal(
    <>
      <div className={style.backdrop} onClick={onCancel} />
      <div className={style.modal} onKeyDown={handleKeyDown}>
        <h3 className={style.title}>Rollback batch</h3>
        {batchName && <p className={style.subtitle}>{batchName}</p>}
        <p className={style.label}>Select reason for rollback:</p>
        <div className={style.reasons}>
          {ROLLBACK_REASONS.map((reason) => {
            const Icon = reason.icon;
            return (
              <button
                key={reason.code}
                type="button"
                className={`${style.reason_pill} ${selectedReason?.code === reason.code ? style.reason_pill_active : ""}`}
                onClick={() => setSelectedReason(reason)}
              >
                {Icon && <Icon size={13} />}
                {reason.label}
              </button>
            );
          })}
        </div>
        {selectedReason?.code === "OTHER" && (
          <input
            className={style.other_input}
            type="text"
            placeholder="Describe the issue..."
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            autoFocus
          />
        )}
        <div className={style.actions}>
          <button type="button" className={style.cancel_btn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={style.confirm_btn} onClick={handleConfirm} disabled={!isConfirmEnabled}>
            Rollback
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default RollbackModal;
