import { Fragment, useMemo } from "react";
import { LuTriangleAlert, LuRepeat2, LuChevronRight, LuCopy } from "react-icons/lu";
import { FiLock } from "react-icons/fi";
import { useStore } from "../../store/useStore";
import { PRODUCTION_STAGE, STAGE_COLOR, STAGE_LABEL } from "../../../shared/constants";
import { STAGE_ICON } from "../../constants/stageIcons";
import { isFeatureEnabled } from "../../utils/featureVisibility";
import { countRipErrorEvents } from "../../utils/ripErrorsByFile";
import { useCloudDayMetres } from "../../hooks/useCloudDayMetres";
import { dayHeading, metresCell, metresCopyText } from "../../utils/cloudMetresText";
import { notify } from "../../utils/notify";
import style from "./OverviewPanel.module.css";

const isSameDay = (iso, ref) => {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
};

// Current-state pipeline pills (left→right). "Sewing" aggregates to_sewing + from_sewing
// (one physical stage for the operator). "shipped" is a daily-flow count, handled
// separately below and visually split from this current-state chain.
const PIPELINE = [
  { key: PRODUCTION_STAGE.PRINTED, label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS, label: STAGE_LABEL.heatpress },
  { key: PRODUCTION_STAGE.QC, label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING, label: "Sewing" },
  { key: PRODUCTION_STAGE.PACKED, label: STAGE_LABEL.packed },
];

// The two day columns of the metres block; keyField names the day key the main process sent along.
const COLUMNS = [
  { field: "yesterday", label: "Yesterday", keyField: "yesterdayKey" },
  { field: "today", label: "Today", keyField: "todayKey" },
];

const OverviewPanel = ({ onNavigate }) => {
  const ripErrors = useStore((s) => s.ripErrors);
  const shopProfile = useStore((s) => s.shopProfile);
  const heldIds = useStore((s) => s.heldIds);
  const openReprints = useStore((s) => s.openReprints);
  const productionStages = useStore((s) => s.productionStages);
  const stageHistory = useStore((s) => s.stageHistory);

  const cloud = useCloudDayMetres();

  // Copy puts "<machine><TAB><metres>" lines on the clipboard, one day at a time.
  const copyDay = async (field, keyField) => {
    const text = metresCopyText(cloud.data.devices, field);
    const heading = dayHeading(cloud.data[keyField]);
    if (!text) {
      notify({ type: "Warning", title: "Nothing to copy", message: `No machine printed on ${heading}.` });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify({ type: "Success", title: "Metres copied", message: `Printed metres for ${heading} are on the clipboard.` });
    } catch {
      notify({ type: "Error", title: "Copy failed", message: "Could not write to the clipboard." });
    }
  };

  // Failures, not files: a whole-batch failure badges every file of the batch but is one error.
  const ripErrorCount = countRipErrorEvents(ripErrors);
  const holdCount = heldIds.size;
  const reprintCount = openReprints.length;

  const stageCounts = useMemo(() => {
    const counts = {};
    for (const row of Object.values(productionStages)) {
      counts[row.stage] = (counts[row.stage] ?? 0) + 1;
    }
    return counts;
  }, [productionStages]);

  const sewingCount = (stageCounts[PRODUCTION_STAGE.TO_SEWING] ?? 0) + (stageCounts[PRODUCTION_STAGE.FROM_SEWING] ?? 0);

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

  const getStageCount = (key) => (key === PRODUCTION_STAGE.TO_SEWING ? sewingCount : (stageCounts[key] ?? 0));

  const statusPills = [
    // The one RIP-error entry that needs its own gate. Every other one (badges, batch
    // header counter, popover) is driven by store.ripErrors and disappears on its own
    // when the App-level poll is off, but this pill renders at zero too — dimmed, still
    // a tile — so an empty store would leave a shop that did not buy the feature staring
    // at a permanent "RIP errors 0". Fail-closed via isFeatureEnabled: an unreadable
    // profile hides it as well.
    ...(isFeatureEnabled("ripErrors", shopProfile)
      ? [{
        id: "rip",
        label: "RIP errors",
        count: ripErrorCount,
        Icon: LuTriangleAlert,
        cls: style.pill_danger,
        onClick: () => onNavigate?.("production"),
      }]
      : []),
    {
      id: "hold",
      label: "Hold",
      count: holdCount,
      Icon: FiLock,
      cls: style.pill_warning,
      onClick: () => onNavigate?.("print"),
    },
    {
      id: "reprint",
      label: "Reprints",
      count: reprintCount,
      Icon: LuRepeat2,
      cls: style.pill_neutral,
      onClick: () => onNavigate?.("production"),
    },
  ];

  const shippedColors = STAGE_COLOR[PRODUCTION_STAGE.SHIPPED];
  const ShippedIcon = STAGE_ICON[PRODUCTION_STAGE.SHIPPED];

  return (
    <div className={style.panel}>
      {/* Printed metres per machine, yesterday and today, from PrintFactory Cloud (FILIP 2026-10-16) */}
      <div className={style.metres}>
        <span className={style.top_label}>Printed metres</span>
        {cloud.status === "unconfigured" && (
          <span className={style.metres_note}>Add the PrintFactory Cloud key in Settings, General.</span>
        )}
        {cloud.status === "loading" && <span className={style.metres_note}>Reading PrintFactory Cloud...</span>}
        {cloud.data && (
          <>
            <div className={style.metres_grid}>
              <span />
              {COLUMNS.map(({ field, label, keyField }) => (
                <span key={field} className={style.metres_colhead}>
                  {label} {dayHeading(cloud.data[keyField])}
                  <button
                    type="button"
                    className={style.metres_copy}
                    onClick={() => copyDay(field, keyField)}
                    title={`Copy ${label.toLowerCase()}`}
                    aria-label={`Copy ${label.toLowerCase()} metres`}
                  >
                    <LuCopy />
                  </button>
                </span>
              ))}
              {cloud.data.devices.map((device) => (
                <Fragment key={device.name}>
                  <span className={style.metres_name} title={device.name}>{device.name}</span>
                  <span className={style.metres_value}>{metresCell(device.yesterday)}</span>
                  <span className={style.metres_value}>{metresCell(device.today)}</span>
                </Fragment>
              ))}
            </div>
            {cloud.data.devices.length === 0 && <span className={style.metres_note}>Nothing printed yesterday or today.</span>}
            {cloud.data.partialJobs > 0 && (
              <span className={style.metres_note}>
                {cloud.data.partialJobs} {cloud.data.partialJobs === 1 ? "job" : "jobs"} could not be read - the totals may be low.
              </span>
            )}
          </>
        )}
        {cloud.status === "error" && <span className={style.metres_error}>{cloud.error}</span>}
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
                {/* the slot after a pill: a chevron, and after the last chain stage the divider before shipped */}
                {i < PIPELINE.length - 1 ? <LuChevronRight className={style.chevron} /> : <span className={style.pipeline_divider} />}
              </div>
            );
          })}
          {/* shipped — daily flow, split from the current-state chain */}
          <div className={`${style.pipeline_step} ${style.pipeline_step_last}`}>
            <button
              type="button"
              className={`${style.stage_pill} ${style.stage_pill_shipped}`}
              style={{ backgroundColor: shippedColors.bg, color: shippedColors.color }}
              onClick={() => onNavigate?.("production")}
              title={`${STAGE_LABEL.shipped} today`}
            >
              {ShippedIcon && <ShippedIcon className={style.stage_icon} />}
              <span className={style.stage_count}>{shippedTodayCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewPanel;
