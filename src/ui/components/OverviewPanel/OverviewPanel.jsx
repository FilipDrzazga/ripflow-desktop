import { useMemo } from "react";
import { LuTriangleAlert, LuRepeat2, LuChevronRight } from "react-icons/lu";
import { FiLock } from "react-icons/fi";
import { useStore, getLastBatch } from "../../store/useStore";
import { PRODUCTION_STAGE, STAGE_COLOR, STAGE_LABEL } from "../../../shared/constants";
import { STAGE_ICON } from "../../constants/stageIcons";
import { PRINTER_COLORS } from "../../constants/printerColors";
import style from "./OverviewPanel.module.css";

// Batch folder name → HH:MM (PRINTED_HHMMSS-GROUP-PRINTER). Lifted from LastBatchCard.
const parseTimeFromName = (name) => {
  const parts = name.split("_");
  if (parts.length < 2) return null;
  const timeStr = parts[1].split("-")[0];
  if (timeStr.length < 6) return null;
  return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
};

const formatTimestamp = (batch, day) => {
  const time = parseTimeFromName(batch.name);
  if (!time) return day.date;
  if (day.label === "Today") return `Today, ${time}`;
  if (day.label === "Yesterday") return `Yesterday, ${time}`;
  return day.date;
};

const isSameDay = (iso, ref) => {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
};

// Current-state pipeline pills (left→right). "Sewing" aggregates to_sewing + from_sewing
// (one physical stage for the operator). "shipped" is a daily-flow count, handled
// separately below and visually split from this current-state chain.
const PIPELINE = [
  { key: PRODUCTION_STAGE.PRINTED,   label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS, label: STAGE_LABEL.heatpress },
  { key: PRODUCTION_STAGE.QC,        label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING, label: "Sewing" },
  { key: PRODUCTION_STAGE.PACKED,    label: STAGE_LABEL.packed },
];

const OverviewPanel = ({ onNavigate }) => {
  const batchDays = useStore((s) => s.batchDays);
  const isBatchSubmitting = useStore((s) => s.isBatchSubmitting);
  const ripErrors = useStore((s) => s.ripErrors);
  const heldIds = useStore((s) => s.heldIds);
  const openReprints = useStore((s) => s.openReprints);
  const productionStages = useStore((s) => s.productionStages);
  const stageHistory = useStore((s) => s.stageHistory);

  const result = useMemo(() => getLastBatch(batchDays), [batchDays]);

  const ripErrorCount = Object.keys(ripErrors).length;
  const holdCount = heldIds.size;
  const reprintCount = openReprints.length;

  const stageCounts = useMemo(() => {
    const counts = {};
    for (const row of Object.values(productionStages)) {
      counts[row.stage] = (counts[row.stage] ?? 0) + 1;
    }
    return counts;
  }, [productionStages]);

  const sewingCount =
    (stageCounts[PRODUCTION_STAGE.TO_SEWING] ?? 0) + (stageCounts[PRODUCTION_STAGE.FROM_SEWING] ?? 0);

  // Files shipped today, from append-only stage history (productionStages loses shipped
  // rows to retention cleanup). Count each file once even if it has >1 shipped entry.
  const shippedTodayCount = useMemo(() => {
    const today = new Date();
    let n = 0;
    for (const entries of Object.values(stageHistory)) {
      if (entries.some((e) => e.stage === PRODUCTION_STAGE.SHIPPED && e.entered_at && isSameDay(e.entered_at, today))) {
        n++;
      }
    }
    return n;
  }, [stageHistory]);

  const getStageCount = (key) =>
    key === PRODUCTION_STAGE.TO_SEWING ? sewingCount : (stageCounts[key] ?? 0);

  const statusPills = [
    { id: "rip",     label: "RIP errors", count: ripErrorCount, Icon: LuTriangleAlert, cls: style.pill_danger,  onClick: () => onNavigate?.("production") },
    { id: "hold",    label: "Hold",       count: holdCount,     Icon: FiLock,          cls: style.pill_warning, onClick: () => onNavigate?.("print") },
    { id: "reprint", label: "Reprints",   count: reprintCount,  Icon: LuRepeat2,       cls: style.pill_neutral, onClick: () => onNavigate?.("production") },
  ];

  const batch = result?.batch;
  const day = result?.day;
  const printerColors = batch ? (PRINTER_COLORS[batch.printer] ?? { bg: "#f0f0f0", color: "#555" }) : null;

  const shippedColors = STAGE_COLOR[PRODUCTION_STAGE.SHIPPED];
  const ShippedIcon = STAGE_ICON[PRODUCTION_STAGE.SHIPPED];

  return (
    <div className={style.panel}>
      {/* Top bar — condensed Last batch */}
      <div className={style.top_bar}>
        <div className={style.top_info}>
          <span className={style.top_label}>Last batch</span>
          {result ? (
            <>
              <span className={style.top_name} title={batch.name}>{batch.name}</span>
              <span className={style.top_sub}>
                {batch.fileCount} {batch.fileCount === 1 ? "file" : "files"} · {formatTimestamp(batch, day)}
              </span>
            </>
          ) : (
            <span className={style.top_empty}>No batches yet</span>
          )}
        </div>
        <div className={style.top_right}>
          {isBatchSubmitting && <span className={style.spinner} />}
          {!isBatchSubmitting && printerColors && (
            <span
              className={style.printer_badge}
              style={{ backgroundColor: printerColors.bg, color: printerColors.color }}
            >
              {batch.printer}
            </span>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div className={style.status_row}>
        {statusPills.map(({ id, label, count, Icon, cls, onClick }) => (
          <button
            key={id}
            type="button"
            className={`${style.status_pill} ${cls} ${count === 0 ? style.status_pill_zero : ""}`}
            onClick={onClick}
            title={label}
          >
            <span className={style.status_top}>
              <Icon className={style.status_icon} />
              <span className={style.status_count}>{count}</span>
            </span>
            <span className={style.status_label}>{label}</span>
          </button>
        ))}
      </div>

      {/* Production pipeline */}
      <div className={style.pipeline_section}>
        <span className={style.pipeline_header}>Production pipeline</span>
        <div className={style.pipeline_row}>
          {PIPELINE.map(({ key, label }, i) => {
            const colors = STAGE_COLOR[key] ?? { bg: "#f0f0f0", color: "#616161" };
            const Icon = STAGE_ICON[key];
            return (
              <div key={key} className={style.pipeline_step}>
                <button
                  type="button"
                  className={style.stage_pill}
                  style={{ backgroundColor: colors.bg, color: colors.color }}
                  onClick={() => onNavigate?.("production")}
                  title={label}
                >
                  {Icon && <Icon className={style.stage_icon} />}
                  <span className={style.stage_count}>{getStageCount(key)}</span>
                </button>
                {i < PIPELINE.length - 1 && <LuChevronRight className={style.chevron} />}
              </div>
            );
          })}
          {/* shipped — daily flow, split from the current-state chain */}
          <span className={style.pipeline_divider} />
          <button
            type="button"
            className={`${style.stage_pill} ${style.stage_pill_shipped}`}
            style={{ backgroundColor: shippedColors.bg, color: shippedColors.color }}
            onClick={() => onNavigate?.("production")}
            title={`${STAGE_LABEL.shipped} today`}
          >
            {ShippedIcon && <ShippedIcon className={style.stage_icon} />}
            <span className={style.stage_count}>{shippedTodayCount}</span>
            <span className={style.stage_today}>today</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewPanel;
