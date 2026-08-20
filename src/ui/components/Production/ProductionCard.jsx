import { useRef, useEffect, useMemo } from "react";
import gsap from "gsap";
import {
  LuScissors,
  LuPrinter, LuThermometer, LuSearch, LuPackage, LuTruck,
  LuFileText, LuCheck, LuRotateCcw, LuTriangleAlert, LuClock,
} from "react-icons/lu";
import {
  PRODUCTION_STAGE, STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_COLOR,
} from "../../../shared/constants";
import { PRINTER_COLORS } from "@/constants/printerColors";
import style from "./Production.module.css";

const SEWING_PIPELINE = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING,
  PRODUCTION_STAGE.FROM_SEWING,
  PRODUCTION_STAGE.PACKED,
  PRODUCTION_STAGE.SHIPPED,
];

const SEWING_STAGES = new Set([PRODUCTION_STAGE.TO_SEWING, PRODUCTION_STAGE.FROM_SEWING]);

// Local time DD-MM-YYYY (NOT UTC) — entered_at is stored as ISO UTC string
const formatStageDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mo}-${d.getFullYear()}`;
};

const STAGE_ICON_MAP = {
  [PRODUCTION_STAGE.PRINTED]:     LuPrinter,
  [PRODUCTION_STAGE.HEATPRESS]:   LuThermometer,
  [PRODUCTION_STAGE.QC]:          LuSearch,
  [PRODUCTION_STAGE.TO_SEWING]:   LuScissors,
  [PRODUCTION_STAGE.FROM_SEWING]: LuScissors,
  [PRODUCTION_STAGE.PACKED]:      LuPackage,
  [PRODUCTION_STAGE.SHIPPED]:     LuTruck,
};


const StagePill = ({ stageKey, status, company, title }) => {
  const Icon    = STAGE_ICON_MAP[stageKey] ?? LuPrinter;
  const colors  = STAGE_COLOR[stageKey] ?? { bg: "#f0f0f0", color: "#616161" };
  const isDone    = status === "completed";
  const isCurrent = status === "current";
  const isFuture  = status === "future";

  return (
    <span
      className={`${style.stage_pill} ${isDone ? style.stage_pill_done : ""} ${isCurrent ? style.stage_pill_current : ""} ${isFuture ? style.stage_pill_future : ""}`}
      style={isCurrent ? { backgroundColor: colors.bg, color: colors.color } : undefined}
      title={title || undefined}
    >
      <Icon size={11} />
      {company || STAGE_SHORT_LABEL[stageKey]}
    </span>
  );
};

// `thumbnail` is a SLOT: a ready-made React element, never a boolean or a path.
// The card must not learn about pdfjs, file paths or PdfThumb — a lens that wants
// a thumbnail builds the element and hands it over. Lenses that pass nothing
// render exactly as before and pay for no SMB reads.
const ProductionCard = ({ stage: row, history = [], highlighted, selected, awaitingQc, ripError, idleDays = null, idleAlert = false, thumbnail, onRipBadgeClick, onSelect, onContextMenu }) => {
  const cardRef  = useRef(null);
  // Where the mouse went down, so a click that ends a text-selection drag doesn't toggle the card.
  const pointerDownRef = useRef(null);

  const handlePointerDown = (e) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCardClick = (e) => {
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    // The mouse travelled between down and up -> this was a drag (selecting text), not a click.
    if (down && (Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4)) return;
    // A non-collapsed selection means the user is highlighting text (e.g. the order number) -> don't toggle.
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && selection.toString().length > 0) return;
    onSelect?.(row.file_id);
  };

  // stage -> formatted date of the LAST entry into that stage (max entered_at; ISO compares lexicographically)
  const stageDates = useMemo(() => {
    const latest = {};
    for (const entry of history) {
      if (!entry?.stage || !entry?.entered_at) continue;
      if (!latest[entry.stage] || entry.entered_at > latest[entry.stage]) latest[entry.stage] = entry.entered_at;
    }
    const out = {};
    for (const [stage, iso] of Object.entries(latest)) {
      const formatted = formatStageDate(iso);
      if (formatted) out[stage] = formatted;
    }
    return out;
  }, [history]);

  useEffect(() => {
    if (!highlighted || !cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { backgroundColor: "#fff3cd" },
      { backgroundColor: selected ? "#eef2ff" : "#ffffff", duration: 1.2, ease: "power2.out" },
    );
  }, [highlighted, selected]);

  const isSewing      = !!row.sewing_sent_at;
  const currentIdx    = SEWING_PIPELINE.indexOf(row.stage);
  const isOffPipeline = currentIdx === -1;

  return (
    <div
      className={`${style.card} ${thumbnail ? style.card_with_thumb : ""} ${selected ? style.card_selected : ""} ${awaitingQc ? style.card_awaiting : ""}`}
      ref={cardRef}
      data-file-id={row.file_id}
      onMouseDown={handlePointerDown}
      onClick={handleCardClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(row, e.clientX, e.clientY); }}
    >
      {/* An explicit class, not :has(> .card_thumb): the card's geometry must not
          depend on DOM shape (wrapping the slot in a container would silently
          restore the 44px height), and the override stays visible to anyone
          reading this file. */}
      {thumbnail && <div className={style.card_thumb}>{thumbnail}</div>}
      <span className={`${style.card_checkbox} ${selected ? style.card_checkbox_checked : ""}`}>
        {selected && <LuCheck size={10} />}
      </span>
      <LuFileText className={style.card_file_icon} />
      <div className={style.card_info}>
        <span className={style.card_filename} title={row.file_id}>{row.file_id}</span>
        {ripError && (
          <span
            className={style.card_type_badge_rip_error}
            onClick={(e) => { e.stopPropagation(); onRipBadgeClick?.(ripError, e.clientX, e.clientY); }}
          >
            <LuTriangleAlert size={12} />
            RIP Error
          </span>
        )}
        {idleDays != null && (
          <span className={`${style.card_type_badge_idle} ${idleAlert ? style.card_type_badge_idle_alert : ""}`}>
            <LuClock size={12} />
            {idleDays}d idle
          </span>
        )}
        {row.print_type === "LM"
          ? row.meters_override != null && (
              <span className={style.card_type_badge_override}>Override: {row.meters_override}m</span>
            )
          : row.qty_override != null && (
              <span className={style.card_type_badge_override}>Override: x{row.qty_override}</span>
            )
        }
        {row.reprint_qty != null && (
          <span className={style.card_type_badge_reprint}>
            <LuRotateCcw size={12} />
            Reprint: {row.print_type === "LM" ? `${row.reprint_qty}m` : `x${row.reprint_qty}`}
            {row.reprint_original != null && row.reprint_original !== row.reprint_qty
              ? ` of ${row.print_type === "LM" ? `${row.reprint_original}m` : `x${row.reprint_original}`}`
              : ""}
          </span>
        )}
        {row.printer && (() => {
          const pc = PRINTER_COLORS[row.printer] ?? { bg: "#f0f0f0", color: "#616161" };
          return <span className={style.card_printer_badge} style={{ backgroundColor: pc.bg, color: pc.color }}>{row.printer}</span>;
        })()}
        {awaitingQc && (() => {
          const hc = STAGE_COLOR[PRODUCTION_STAGE.HEATPRESS] ?? { bg: "#fff3cd", color: "#856404" };
          return (
            <span className={style.card_awaiting_badge} style={{ backgroundColor: hc.bg, color: hc.color }}>
              <LuSearch size={12} />
              Awaiting QC
            </span>
          );
        })()}
      </div>

      <span className={style.separator} />

      <div className={style.stage_pills}>
        {isOffPipeline ? (
          <span
            className={`${style.stage_pill} ${style.stage_pill_current}`}
            style={{ backgroundColor: STAGE_COLOR[row.stage]?.bg, color: STAGE_COLOR[row.stage]?.color, gridColumn: "1 / -1" }}
          >
            {STAGE_LABEL[row.stage] ?? row.stage}
          </span>
        ) : (
          SEWING_PIPELINE.map((stageKey, i) => {
            if (!isSewing && SEWING_STAGES.has(stageKey)) return <StagePill key={stageKey} stageKey={stageKey} status="future" />;
            const status = i < currentIdx ? "completed" : i === currentIdx ? "current" : "future";
            const company = stageKey === "to_sewing" ? row.sewing_company : null;
            // Date tooltip only on reached + current pills; future pills get no title
            const title = status === "future" ? undefined : stageDates[stageKey];
            return <StagePill key={stageKey} stageKey={stageKey} status={status} company={company} title={title} />;
          })
        )}
      </div>

    </div>
  );
};

export default ProductionCard;
