import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import {
  LuScissors,
  LuPrinter, LuThermometer, LuSearch, LuPackage, LuTruck,
  LuFileText, LuCheck,
} from "react-icons/lu";
import {
  PRODUCTION_STAGE, STAGE_LABEL, STAGE_COLOR, SEWING_SUGGESTED_TYPES,
} from "../../../shared/constants";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
import style from "./Production.module.css";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const STANDARD_PIPELINE = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.PACKED,
  PRODUCTION_STAGE.SHIPPED,
];

const SEWING_PIPELINE = [
  PRODUCTION_STAGE.PRINTED,
  PRODUCTION_STAGE.HEATPRESS,
  PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING,
  PRODUCTION_STAGE.FROM_SEWING,
  PRODUCTION_STAGE.PACKED,
  PRODUCTION_STAGE.SHIPPED,
];

const STAGE_ICON_MAP = {
  [PRODUCTION_STAGE.PRINTED]:     LuPrinter,
  [PRODUCTION_STAGE.HEATPRESS]:   LuThermometer,
  [PRODUCTION_STAGE.QC]:          LuSearch,
  [PRODUCTION_STAGE.TO_SEWING]:   LuScissors,
  [PRODUCTION_STAGE.FROM_SEWING]: LuScissors,
  [PRODUCTION_STAGE.PACKED]:      LuPackage,
  [PRODUCTION_STAGE.SHIPPED]:     LuTruck,
};

const formatElapsed = (isoStr) => {
  if (!isoStr) return { text: null, overdue: false };
  const ms = Date.now() - new Date(isoStr).getTime();
  if (isNaN(ms)) return { text: null, overdue: false };
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return { text: `${mins}m`, overdue: ms > FOUR_HOURS_MS };
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return { text: rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`, overdue: ms > FOUR_HOURS_MS };
  return { text: `${Math.floor(hrs / 24)}d`, overdue: true };
};

const formatDuration = (ms) => {
  if (ms < 0) ms = 0;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const buildTimeline = (row, history) => {
  if (!history || history.length === 0) {
    if (!row.updated_at) return [];
    return [{ label: STAGE_LABEL[row.stage] ?? row.stage, duration: formatElapsed(row.updated_at).text, isCurrent: true }];
  }
  const now = Date.now();
  return history.map((entry, i) => {
    const start = new Date(entry.entered_at).getTime();
    const end   = i < history.length - 1 ? new Date(history[i + 1].entered_at).getTime() : now;
    return {
      label:     STAGE_LABEL[entry.stage] ?? entry.stage,
      duration:  formatDuration(end - start),
      isCurrent: i === history.length - 1,
    };
  });
};

const StagePill = ({ stageKey, status }) => {
  const Icon    = STAGE_ICON_MAP[stageKey] ?? LuPrinter;
  const colors  = STAGE_COLOR[stageKey] ?? { bg: "#f0f0f0", color: "#616161" };
  const label   = STAGE_LABEL[stageKey] ?? stageKey;
  const isDone    = status === "completed";
  const isCurrent = status === "current";
  const isFuture  = status === "future";

  return (
    <span
      className={`${style.stage_pill} ${isDone ? style.stage_pill_done : ""} ${isCurrent ? style.stage_pill_current : ""} ${isFuture ? style.stage_pill_future : ""} ${stageKey === PRODUCTION_STAGE.SHIPPED ? style.stage_pill_shipped : ""}`}
      style={isCurrent ? { backgroundColor: colors.bg, color: colors.color } : undefined}
    >
      <Icon size={13} />
      {label}
    </span>
  );
};

const ProductionCard = ({ stage: row, history, highlighted, selected, onSelect, onContextMenu }) => {
  const cardRef  = useRef(null);
  const badgeRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  useEffect(() => {
    if (!highlighted || !cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { backgroundColor: "#fff3cd" },
      { backgroundColor: selected ? "#eef2ff" : "#ffffff", duration: 1.2, ease: "power2.out" },
    );
  }, [highlighted, selected]);

  const printTypeDef  = PRINT_TYPE_MAP[row.print_type];
  const isSewing      = !!row.sewing_sent_at;
  const pipeline      = isSewing ? SEWING_PIPELINE : STANDARD_PIPELINE;
  const isShipped     = row.stage === PRODUCTION_STAGE.SHIPPED;

  const currentIdx    = pipeline.indexOf(row.stage);
  const isOffPipeline = currentIdx === -1;
  const { text: elapsedText, overdue } = isShipped
    ? { text: null, overdue: false }
    : formatElapsed(row.updated_at);

  return (
    <div
      className={`${style.card} ${selected ? style.card_selected : ""}`}
      ref={cardRef}
      data-file-id={row.file_id}
      onClick={() => onSelect?.(row.file_id)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(row, e.clientX, e.clientY); }}
    >
      <span className={`${style.card_checkbox} ${selected ? style.card_checkbox_checked : ""}`}>
        {selected && <LuCheck size={10} />}
      </span>
      <LuFileText className={style.card_file_icon} />
      <div className={style.card_info}>
        <span className={style.card_order}>{row.order_id ?? "—"}</span>
        <span className={style.card_customer}>{row.customer_name ?? "—"}</span>
        {printTypeDef ? (
          <span className={style.card_type_tag}>
            <printTypeDef.Icon size={16} style={{ color: printTypeDef.color }} />
            {printTypeDef.label}
          </span>
        ) : row.print_type ? (
          <span className={style.card_type_tag}>{row.print_type}</span>
        ) : null}
        {row.print_type === "LM"
          ? row.meters != null && <span className={style.card_type_badge}>{row.meters}m</span>
          : row.qty != null && <span className={style.card_type_badge}>x{row.qty}</span>
        }
      </div>

      <span className={style.separator} />

      <div className={style.stage_pills}>
        {isOffPipeline ? (
          <span
            className={`${style.stage_pill} ${style.stage_pill_current}`}
            style={{ backgroundColor: STAGE_COLOR[row.stage]?.bg, color: STAGE_COLOR[row.stage]?.color }}
          >
            {STAGE_LABEL[row.stage] ?? row.stage}
          </span>
        ) : (
          pipeline.map((stageKey, i) => {
            const status = i < currentIdx ? "completed" : i === currentIdx ? "current" : "future";
            return <StagePill key={stageKey} stageKey={stageKey} status={status} />;
          })
        )}
      </div>

      {elapsedText && (
        <div
          ref={badgeRef}
          className={`${style.elapsed_badge} ${overdue ? style.elapsed_badge_overdue : ""}`}
          onMouseEnter={() => {
            const r = badgeRef.current?.getBoundingClientRect();
            if (r) setTooltipPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right });
          }}
          onMouseLeave={() => setTooltipPos(null)}
        >
          {elapsedText}
        </div>
      )}
      {tooltipPos && createPortal(
        <div className={style.elapsed_tooltip} style={{ bottom: tooltipPos.bottom, right: tooltipPos.right }}>
          {buildTimeline(row, history).map(({ label, duration, isCurrent }, idx) => (
            <div key={idx} className={`${style.tooltip_row} ${isCurrent ? style.tooltip_row_current : ""}`}>
              <span>{label}</span>
              <span className={style.tooltip_time}>{duration}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ProductionCard;
