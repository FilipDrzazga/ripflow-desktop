import { useMemo } from "react";
import { LuTriangleAlert, LuRepeat2 } from "react-icons/lu";
import { FiLock } from "react-icons/fi";
import { useStore } from "../../store/useStore";
import { ALERT_ID, alertsBarData } from "../../utils/overviewBars";
import GooBar from "./GooBar";
import { ALERT_LOOK } from "./barColors";
import style from "./OverviewBars.module.css";

// Where a click on a chip leads, as before the bars: RIP errors and reprints live in
// Production, held files are handled on the Print view.
const ALERT_VIEW = { [ALERT_ID.RIP]: "production", [ALERT_ID.HOLD]: "print", [ALERT_ID.REPRINT]: "production" };
const ALERT_ICON = { [ALERT_ID.RIP]: LuTriangleAlert, [ALERT_ID.HOLD]: FiLock, [ALERT_ID.REPRINT]: LuRepeat2 };

const AlertsBar = ({ onNavigate }) => {
  const ripErrors = useStore((state) => state.ripErrors);
  const shopProfile = useStore((state) => state.shopProfile);
  const heldIds = useStore((state) => state.heldIds);
  const openReprints = useStore((state) => state.openReprints);

  const { items, total, segments } = useMemo(
    () => alertsBarData({ ripErrors, heldIds, openReprints, shopProfile }),
    [ripErrors, heldIds, openReprints, shopProfile],
  );

  const barSegments = useMemo(
    () =>
      segments.map((segment) => ({
        key: segment.key,
        weight: segment.share,
        color: ALERT_LOOK[segment.key].bar,
        title: `${segment.label} · ${segment.count}`,
      })),
    [segments],
  );

  return (
    <div className={style.card}>
      <div className={style.card_header}>
        <div className={style.card_heading}>
          <h2 className={style.card_title}>Attention</h2>
          <span className={style.card_sub}>{total === 0 ? "nothing to flag" : "needs a look"}</span>
        </div>
        <span className={style.card_total}>{total}</span>
      </div>

      <GooBar segments={barSegments} label="Open alerts" />

      <div className={style.chips}>
        {items.map(({ id, label, count }) => {
          const Icon = ALERT_ICON[id];
          const look = ALERT_LOOK[id];
          return (
            <button
              key={id}
              type="button"
              className={`${style.chip} ${count === 0 ? style.chip_zero : ""}`.trim()}
              style={{ backgroundColor: look.bg, color: look.color }}
              onClick={() => onNavigate?.(ALERT_VIEW[id])}
              title={label}
            >
              <Icon className={style.chip_icon} />
              <span className={style.chip_count}>{count}</span>
              <span className={style.chip_label}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AlertsBar;
