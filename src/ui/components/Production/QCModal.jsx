import { useState } from "react";
import { createPortal } from "react-dom";
import { LuFileText, LuScissors, LuCheck } from "react-icons/lu";
import { PRODUCTION_STAGE, QC_ACTION, SEWING_SUGGESTED_TYPES } from "../../../shared/constants";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { useStore } from "../../store/useStore";
import { resolveIcon } from "../../constants/rollbackReasonIcons";
import ContextMenu from "../ContextMenu/ContextMenu";
import style from "./Production.module.css";

// Quantity of the current print run: a reprint run's qty_override/meters_override
// takes precedence over the file's original qty/meters.
const runQty = (f) => (f.print_type === "LM" ? f.meters_override ?? f.meters : f.qty_override ?? f.qty);

// Default reprint override = full run quantity (meters for LM, pieces otherwise)
const defaultOverride = (f) => {
  const v = runQty(f);
  if (v == null) return null;
  return f.print_type === "LM" ? { meters: v } : { qty: v };
};

const QCModal = ({ batchPath, files, onConfirm, onClose }) => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);

  const sewingFiles     = files.filter((f) => f.stage === PRODUCTION_STAGE.TO_SEWING || f.stage === PRODUCTION_STAGE.FROM_SEWING);
  const qcFiles         = files.filter((f) => f.stage === PRODUCTION_STAGE.QC);
  const hasSewingReturn = sewingFiles.length > 0;

  const [phase, setPhase] = useState(hasSewingReturn ? "sewing_return" : "qc");

  // fileId → { action, rejectReason, sewingCompany, override }  (sewing_return phase)
  const [sewingChoices, setSewingChoices] = useState(() => {
    const m = new Map();
    sewingFiles.forEach((f) => m.set(f.file_id, { action: QC_ACTION.PASS, rejectReason: null, sewingCompany: null, override: defaultOverride(f) }));
    return m;
  });

  // fileId → { action, rejectReason, sewingCompany, override }  (qc phase)
  const [qcChoices, setQcChoices] = useState(() => {
    const m = new Map();
    qcFiles.forEach((f) => m.set(f.file_id, { action: QC_ACTION.PASS, rejectReason: null, sewingCompany: null, override: defaultOverride(f) }));
    return m;
  });

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [contextMenu,  setContextMenu]  = useState(null); // { x, y, fileId }

  // ─── Selection ────────────────────────────────────────────────────────────

  const toggleSelect = (fileId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };

  const currentFiles = phase === "sewing_return"
    ? sewingFiles
    : [...qcChoices.keys()].map((id) => files.find((f) => f.file_id === id)).filter(Boolean);

  const selectAll   = () => setSelectedIds(new Set(currentFiles.map((f) => f.file_id)));
  const clearSelect = () => setSelectedIds(new Set());

  // ─── Apply helpers ────────────────────────────────────────────────────────

  const getTargetIds = (triggerId) => selectedIds.size > 0 ? [...selectedIds] : [triggerId];

  const applyAction = (triggerId, action, sewingCompany = null) => {
    const ids = getTargetIds(triggerId);
    const setter = phase === "sewing_return" ? setSewingChoices : setQcChoices;
    setter((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const cur = next.get(id);
        if (cur) next.set(id, { ...cur, action, rejectReason: null, sewingCompany });
      });
      return next;
    });
    clearSelect();
    closeContextMenu();
  };

  const setOverride = (fileId, override) => {
    const setter = phase === "sewing_return" ? setSewingChoices : setQcChoices;
    setter((prev) => {
      const next = new Map(prev);
      const cur = next.get(fileId);
      if (cur) next.set(fileId, { ...cur, override });
      return next;
    });
  };

  const applyRollback = (triggerId, reason) => {
    const ids = getTargetIds(triggerId);
    const setter = phase === "sewing_return" ? setSewingChoices : setQcChoices;
    setter((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const cur = next.get(id);
        if (cur) next.set(id, { ...cur, action: QC_ACTION.REJECT, rejectReason: reason });
      });
      return next;
    });
    clearSelect();
    closeContextMenu();
  };

  // ─── Context menu ─────────────────────────────────────────────────────────

  const buildMenuOptions = (fileId) => {
    const isBulk = selectedIds.size > 0 && selectedIds.has(fileId);
    const count  = isBulk ? selectedIds.size : 1;

    const rollbackChildren = [
      ...reasonDefinitions.filter((r) => r.code !== "OTHER").map((r) => {
        const Icon = resolveIcon(r.iconName);
        return { id: r.code, label: r.label, icon: Icon ? <Icon size={14} /> : null, onClick: () => applyRollback(fileId, r) };
      }),
      ...(reasonDefinitions.some((r) => r.code === "OTHER") ? [{ id: "sep-other", separator: true }] : []),
      ...reasonDefinitions.filter((r) => r.code === "OTHER").map((r) => {
        const Icon = resolveIcon(r.iconName);
        return { id: r.code, label: r.label, icon: Icon ? <Icon size={14} /> : null, onClick: () => applyRollback(fileId, r) };
      }),
    ];

    return [
      ...(phase !== "sewing_return" ? [
        {
          id: "sewing",
          label: isBulk ? `✂ Sewing ${count} selected` : "✂ Sewing",
          sewing: true,
          children: [
            { id: "olya",     label: "Olya",     onClick: () => applyAction(fileId, QC_ACTION.SEWING, "Olya") },
            { id: "vagabond", label: "Vagabond", onClick: () => applyAction(fileId, QC_ACTION.SEWING, "Vagabond") },
          ],
        },
      ] : []),
      { id: "pending",  label: isBulk ? `… Pending ${count} selected` : "… Pending",              onClick: () => applyAction(fileId, QC_ACTION.PENDING) },
      { id: "sep1", separator: true },
      { id: "rollback", label: isBulk ? (count === 1 ? "Rollback this file" : `Rollback ${count} files`) : "Rollback this file", danger: true, children: rollbackChildren },
    ];
  };

  const openContextMenu  = (fileId, x, y) => setContextMenu({ x, y, fileId });
  const closeContextMenu = () => setContextMenu(null);

  // ─── Confirm handlers ─────────────────────────────────────────────────────

  const handleConfirmSewingReturn = () => {
    setSelectedIds(new Set());
    if (qcFiles.length === 0) {
      const decisions = [];
      sewingChoices.forEach(({ action, rejectReason, sewingCompany, override }, fileId) => {
        decisions.push({ fileId, action, fromSewing: true, reason: rejectReason ?? null, sewingCompany: sewingCompany ?? null, override: override ?? null });
      });
      onConfirm(decisions);
    } else {
      setPhase("qc");
    }
  };

  const handleConfirmQC = () => {
    const decisions = [];
    sewingChoices.forEach(({ action, rejectReason, sewingCompany, override }, fileId) => {
      decisions.push({ fileId, action, fromSewing: true, reason: rejectReason ?? null, sewingCompany: sewingCompany ?? null, override: override ?? null });
    });
    qcChoices.forEach(({ action, rejectReason, sewingCompany, override }, fileId) => {
      decisions.push({ fileId, action, fromSewing: false, reason: rejectReason ?? null, sewingCompany: sewingCompany ?? null, override: override ?? null });
    });
    onConfirm(decisions);
  };

  // ─── Shared file info ─────────────────────────────────────────────────────

  const renderFileInfo = (f) => {
    const printTypeDef = PRINT_TYPE_MAP[f.print_type];
    return (
      <div className={style.card_info}>
        <span className={style.card_order}>{f.order_id ?? "—"}</span>
        <span className={style.card_customer} style={{ maxWidth: "none" }}>{f.customer_name ?? "—"}</span>
        {printTypeDef ? (
          <span className={style.card_type_tag}>
            <printTypeDef.Icon size={16} style={{ color: printTypeDef.color }} />
            {printTypeDef.label}
          </span>
        ) : f.print_type ? (
          <span className={style.card_type_tag}>{f.print_type}</span>
        ) : null}
        {f.print_type === "LM"
          ? f.meters != null && <span className={style.card_type_badge}>{f.meters}m</span>
          : f.qty    != null && <span className={style.card_type_badge}>x{f.qty}</span>
        }
        {f.material && <span className={style.card_material}>{f.material}</span>}
        {f.printer && (() => {
          const pc = PRINTER_COLORS[f.printer] ?? { bg: "#f0f0f0", color: "#616161" };
          return <span className={style.card_printer_badge} style={{ backgroundColor: pc.bg, color: pc.color }}>{f.printer}</span>;
        })()}
      </div>
    );
  };

  // ─── Card list ────────────────────────────────────────────────────────────

  const renderFileCards = (displayFiles, choicesMap) =>
    displayFiles.map((file) => {
      const { action, rejectReason, sewingCompany, override } = choicesMap.get(file.file_id) ?? { action: QC_ACTION.PASS };
      const isSelected = selectedIds.has(file.file_id);
      const isLm = file.print_type === "LM";
      const originalVal = runQty(file);
      const overrideVal = override != null ? (override.meters ?? override.qty ?? "") : "";
      return (
        <div
          key={file.file_id}
          className={`${style.card} ${isSelected ? style.card_selected : ""}`}
          style={{ margin: "3px 0", cursor: "pointer" }}
          onClick={() => toggleSelect(file.file_id)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openContextMenu(file.file_id, e.clientX, e.clientY); }}
        >
          <span className={`${style.card_checkbox} ${isSelected ? style.card_checkbox_checked : ""}`}>
            {isSelected && <LuCheck size={10} />}
          </span>
          <LuFileText className={style.card_file_icon} />
          {renderFileInfo(file)}
          {action === QC_ACTION.PASS    && <span className={`${style.qc_action_badge} ${style.qc_action_badge_pass}`}>✓ Pass</span>}
          {action === QC_ACTION.SEWING  && <span className={`${style.qc_action_badge} ${style.qc_action_badge_sewing}`}>✂ {sewingCompany ?? "Sewing"}</span>}
          {action === QC_ACTION.PENDING && <span className={`${style.qc_action_badge} ${style.qc_action_badge_pending}`}>… Pending</span>}
          {action === QC_ACTION.REJECT  && (
            <>
              <span className={`${style.qc_action_badge} ${style.qc_action_badge_reject}`}>
                {rejectReason ? rejectReason.label : "…"}
              </span>
              {originalVal != null && (
                <input
                  type="number"
                  className={style.qc_override_input}
                  min={1}
                  max={originalVal}
                  placeholder={isLm ? `Max ${originalVal}m` : `Max ${originalVal}`}
                  value={overrideVal}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) { setOverride(file.file_id, defaultOverride(file)); return; }
                    const num = Number(val);
                    if (num > originalVal) return;
                    setOverride(file.file_id, isLm ? { meters: num } : { qty: num });
                  }}
                />
              )}
            </>
          )}
          {SEWING_SUGGESTED_TYPES.includes(file.print_type) && action !== QC_ACTION.SEWING && (
            <span className={style.qc_sewing_end}><LuScissors size={15} /></span>
          )}
        </div>
      );
    });

  // ─── Per-phase computed ────────────────────────────────────────────────────

  const batchName = batchPath?.split(/[/\\]/).pop() ?? "";

  const activeChoices    = phase === "sewing_return" ? sewingChoices : qcChoices;
  const activePending    = [...activeChoices.values()].filter((c) => c.action === QC_ACTION.PENDING).length;
  const hasUnreasonedRej = [...activeChoices.values()].some((c) => c.action === QC_ACTION.REJECT && !c.rejectReason);

  return createPortal(
    <>
      <div className={style.backdrop} onClick={onClose} />
      <div className={`${style.modal} ${style.qc_modal}`}>

        <div className={style.qc_action_bar}>
          <h3 className={style.modal_title} style={{ margin: 0 }}>
            {phase === "sewing_return" ? "RETURNED FROM SEWING" : batchName}
          </h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {selectedIds.size > 0 && (
              <button type="button" className={style.modal_cancel} onClick={clearSelect}>Clear</button>
            )}
            <button type="button" className={style.modal_cancel} onClick={selectAll}>Select all</button>
          </div>
        </div>

        <div className={style.qc_file_list}>
          {phase === "sewing_return"
            ? renderFileCards(sewingFiles, sewingChoices)
            : renderFileCards(currentFiles, qcChoices)
          }
        </div>

        {activePending > 0 && (
          <p className={style.qc_pending_note}>
            {activePending} file{activePending > 1 ? "s" : ""} pending — will remain at {phase === "sewing_return" ? "sewing" : "QC"}
          </p>
        )}

        <div className={style.modal_footer}>
          <button type="button" className={style.modal_cancel} onClick={onClose}>Cancel</button>
          {phase === "sewing_return" ? (
            <button
              type="button"
              className={style.modal_confirm}
              onClick={handleConfirmSewingReturn}
              disabled={hasUnreasonedRej}
            >
              {qcFiles.length > 0 ? "Next: QC →" : "Confirm"}
            </button>
          ) : (
            <button type="button" className={style.modal_confirm} onClick={handleConfirmQC} disabled={hasUnreasonedRej}>
              Confirm
            </button>
          )}
        </div>

      </div>

      {contextMenu && (
        <ContextMenu
          id="qc-modal-ctx"
          anchorX={contextMenu.x}
          anchorY={contextMenu.y}
          options={buildMenuOptions(contextMenu.fileId)}
          onClose={closeContextMenu}
          zIndex={3200}
        />
      )}
    </>,
    document.body,
  );
};

export default QCModal;
