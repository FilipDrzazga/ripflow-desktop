import { useRef, useEffect } from "react";
import gsap from "gsap";
import {
  LuScissors,
  LuPrinter, LuThermometer, LuSearch, LuPackage, LuTruck,
  LuFileText, LuCheck, LuRotateCcw,
} from "react-icons/lu";
import {
  PRODUCTION_STAGE, STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_COLOR,
} from "../../../shared/constants";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
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

const STAGE_ICON_MAP = {
  [PRODUCTION_STAGE.PRINTED]:     LuPrinter,
  [PRODUCTION_STAGE.HEATPRESS]:   LuThermometer,
  [PRODUCTION_STAGE.QC]:          LuSearch,
  [PRODUCTION_STAGE.TO_SEWING]:   LuScissors,
  [PRODUCTION_STAGE.FROM_SEWING]: LuScissors,
  [PRODUCTION_STAGE.PACKED]:      LuPackage,
  [PRODUCTION_STAGE.SHIPPED]:     LuTruck,
};


const StagePill = ({ stageKey, status, company }) => {
  const Icon    = STAGE_ICON_MAP[stageKey] ?? LuPrinter;
  const colors  = STAGE_COLOR[stageKey] ?? { bg: "#f0f0f0", color: "#616161" };
  const isDone    = status === "completed";
  const isCurrent = status === "current";
  const isFuture  = status === "future";

  return (
    <span
      className={`${style.stage_pill} ${isDone ? style.stage_pill_done : ""} ${isCurrent ? style.stage_pill_current : ""} ${isFuture ? style.stage_pill_future : ""}`}
      style={isCurrent ? { backgroundColor: colors.bg, color: colors.color } : undefined}
      title={STAGE_LABEL[stageKey] ?? stageKey}
    >
      <Icon size={11} />
      {company || STAGE_SHORT_LABEL[stageKey]}
    </span>
  );
};

const ProductionCard = ({ stage: row, highlighted, selected, awaitingQc, onSelect, onContextMenu }) => {
  const cardRef  = useRef(null);

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
  const currentIdx    = SEWING_PIPELINE.indexOf(row.stage);
  const isOffPipeline = currentIdx === -1;

  return (
    <div
      className={`${style.card} ${selected ? style.card_selected : ""} ${awaitingQc ? style.card_awaiting : ""}`}
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
        {row.material && <span className={style.card_material}>{row.material}</span>}
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
            return <StagePill key={stageKey} stageKey={stageKey} status={status} company={company} />;
          })
        )}
      </div>

    </div>
  );
};

export default ProductionCard;
