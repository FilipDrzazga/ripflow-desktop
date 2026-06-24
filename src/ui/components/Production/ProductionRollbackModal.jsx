import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuFileText } from "react-icons/lu";
import { HiChevronDown } from "react-icons/hi2";
import { useStore } from "../../store/useStore";
import { resolveIcon } from "../../constants/rollbackReasonIcons";
import { PRINTER_COLORS } from "@/constants/printerColors";
import style from "./Production.module.css";

// ─── ReasonDropdown ────────────────────────────────────────────────────────────
// Portaled dropdown so it's not clipped by qc_file_list overflow-y: auto.

const ReasonIcon = ({ iconName, size }) => {
  const Icon = resolveIcon(iconName);
  // eslint-disable-next-line react-hooks/static-components -- resolveIcon returns a static component from ICON_MAP, not one created per render
  return Icon ? <Icon size={size} /> : null;
};

const ReasonDropdown = ({ reasons, value, onChange, placeholder = "Select reason..." }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleToggle = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  };

  const selected = reasons.find((r) => r.code === value?.code) ?? null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        className={style.reason_dropdown_trigger}
        onClick={handleToggle}
      >
        <span className={style.reason_dropdown_icon}>
          {selected ? <ReasonIcon iconName={selected.iconName} size={13} /> : null}
        </span>
        <span className={selected ? style.reason_dropdown_label : style.reason_dropdown_placeholder}>
          {selected ? selected.label : placeholder}
        </span>
        <HiChevronDown size={12} style={{ marginLeft: "auto", flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className={style.reason_dropdown_menu}
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {reasons.map((r) => (
            <button
              key={r.code}
              type="button"
              className={`${style.reason_dropdown_item} ${value?.code === r.code ? style.reason_dropdown_item_active : ""}`}
              onClick={() => { onChange(r); setOpen(false); }}
            >
              <span className={style.reason_dropdown_icon}><ReasonIcon iconName={r.iconName} size={14} /></span>
              {r.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

// ─── ProductionRollbackModal ───────────────────────────────────────────────────

// Quantity of the current print run: a reprint run's qty_override/meters_override
// takes precedence over the file's original qty/meters.
const runQty = (r) => (r.print_type === "LM" ? r.meters_override ?? r.meters : r.qty_override ?? r.qty);

const defaultOverride = (r) => {
  const v = runQty(r);
  if (v == null) return null;
  return r.print_type === "LM" ? { meters: v } : { qty: v };
};

// Raw-input string for the qty field (separate from the numeric submit value so
// the operator can clear it from the keyboard while editing).
const overrideToStr = (ov) => (ov == null ? "" : String(ov.meters ?? ov.qty));

// rows: stageRow[] from productionStages
const ProductionRollbackModal = ({ rows, onConfirm, onCancel }) => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);

  // fileId → { reason, otherText, override }
  const [choices, setChoices] = useState(() => {
    const m = new Map();
    rows.forEach((r) => {
      const ov = defaultOverride(r);
      m.set(r.file_id, { reason: null, otherText: "", override: ov, overrideInput: overrideToStr(ov) });
    });
    return m;
  });

  const setReason = (fileId, reason) => {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(fileId);
      if (cur) next.set(fileId, { ...cur, reason });
      return next;
    });
  };

  const setOtherText = (fileId, text) => {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(fileId);
      if (cur) next.set(fileId, { ...cur, otherText: text });
      return next;
    });
  };

  // Update only the raw string while typing (no parse/clamp — allows empty).
  const setOverrideInput = (fileId, overrideInput) => {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(fileId);
      if (cur) next.set(fileId, { ...cur, overrideInput });
      return next;
    });
  };

  // Commit the numeric submit value + normalized string (on blur / from default).
  const commitOverride = (fileId, override, overrideInput) => {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(fileId);
      if (cur) next.set(fileId, { ...cur, override, overrideInput });
      return next;
    });
  };

  // Parse the raw input; reset to the full run quantity when empty / invalid / <= 0,
  // otherwise clamp to (0, originalVal].
  const commitOverrideFromInput = (row) => {
    const isLm = row.print_type === "LM";
    const originalVal = runQty(row);
    const raw = (choices.get(row.file_id)?.overrideInput ?? "").trim();
    const num = isLm ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(num) || num <= 0) {
      const dv = defaultOverride(row);
      commitOverride(row.file_id, dv, overrideToStr(dv));
      return;
    }
    const clamped = originalVal != null && num > originalVal ? originalVal : num;
    commitOverride(row.file_id, isLm ? { meters: clamped } : { qty: clamped }, String(clamped));
  };

  const canConfirm = [...choices.values()].every(
    (c) => c.reason !== null && (c.reason.code !== "OTHER" || c.otherText.trim().length > 0),
  );

  const handleConfirm = () => {
    if (!canConfirm) return;
    const decisions = [];
    choices.forEach(({ reason, otherText, override }, fileId) => {
      const resolvedReason = reason.code === "OTHER"
        ? { code: "OTHER", label: otherText.trim() }
        : reason;
      decisions.push({ fileId, reason: resolvedReason, override });
    });
    onConfirm(decisions);
  };

  const applyReasonToAll = (reason) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.forEach((cur, id) => next.set(id, { ...cur, reason }));
      return next;
    });
  };

  const sortedReasons = [...reasonDefinitions].sort((a, b) =>
    a.code === "OTHER" ? 1 : b.code === "OTHER" ? -1 : 0,
  );

  return createPortal(
    <>
      <div className={style.backdrop} onClick={onCancel} />
      <div className={`${style.modal} ${style.qc_modal}`}>

        <div className={style.qc_action_bar}>
          <h3 className={style.modal_title} style={{ margin: 0 }}>Rollback to Inbox:</h3>
          {rows.length > 1 && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Apply to all:</span>
              <ReasonDropdown
                reasons={sortedReasons.filter((r) => r.code !== "OTHER")}
                value={null}
                onChange={applyReasonToAll}
                placeholder="Apply to all..."
              />
            </div>
          )}
        </div>

        <div className={style.qc_file_list}>
          {rows.map((row) => {
            const { reason, otherText, overrideInput } = choices.get(row.file_id) ?? {};
            const isLm = row.print_type === "LM";
            const originalVal = runQty(row);

            return (
              <div
                key={row.file_id}
                className={style.card}
                style={{ margin: "3px 0", cursor: "default", flexWrap: "wrap", height: "auto", minHeight: 44, paddingTop: reason?.code === "OTHER" ? 10 : 0, paddingBottom: reason?.code === "OTHER" ? 10 : 0 }}
              >
                <LuFileText className={style.card_file_icon} />
                <div className={style.card_info}>
                  <span className={style.card_filename} title={row.file_id}>{row.file_id}</span>
                  {row.printer && (() => {
                    const pc = PRINTER_COLORS[row.printer] ?? { bg: "#f0f0f0", color: "#616161" };
                    return <span className={style.card_printer_badge} style={{ backgroundColor: pc.bg, color: pc.color }}>{row.printer}</span>;
                  })()}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <ReasonDropdown
                    reasons={sortedReasons}
                    value={reason ?? null}
                    onChange={(r) => setReason(row.file_id, r)}
                  />
                  <input
                    type="number"
                    className={style.qc_override_input}
                    min={isLm ? 0.1 : 1}
                    step={isLm ? 0.1 : 1}
                    max={originalVal ?? undefined}
                    placeholder={isLm
                      ? (originalVal != null ? `Max ${originalVal}m` : "m")
                      : (originalVal != null ? `Max ${originalVal}` : "qty")}
                    value={overrideInput ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      const re = isLm ? /^\d*\.?\d*$/ : /^\d*$/;
                      if (val === "" || re.test(val)) setOverrideInput(row.file_id, val);
                    }}
                    onBlur={() => commitOverrideFromInput(row)}
                    style={{ borderRadius: 8 }}
                  />
                </div>

                {reason?.code === "OTHER" && (
                  <input
                    className={style.other_input}
                    type="text"
                    placeholder="Describe the issue..."
                    value={otherText}
                    onChange={(e) => setOtherText(row.file_id, e.target.value)}
                    autoFocus
                    style={{ width: "100%", margin: "3px 0 0", borderRadius: 8 }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className={style.modal_footer}>
          <button type="button" className={style.modal_cancel} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={style.modal_confirm}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Rollback{rows.length > 1 ? ` ${rows.length} files` : ""}
          </button>
        </div>

      </div>
    </>,
    document.body,
  );
};

export default ProductionRollbackModal;
