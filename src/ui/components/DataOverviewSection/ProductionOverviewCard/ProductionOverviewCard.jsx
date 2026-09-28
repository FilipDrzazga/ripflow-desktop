import { useEffect, useMemo, useState } from "react";
import style from "./ProductionOverviewCard.module.css";
import { useStore } from "../../../store/useStore";
import { LuAlarmClock } from "react-icons/lu";
import { inboxClassSplit } from "../../../utils/inboxClassSplit";

// The colours of each material-class SLOT (4-types-b part 2): slot 0 = the blues Cottons always
// had, slot 1 = the violets of Polyesters. The row NAMES come from the shop profile
// (utils/inboxClassSplit.js); on Alex's profile the card looks exactly as before.
const SLOT_COLORS = [
  {
    accent: "#3f8ee0",
    gradient: "linear-gradient(90deg, #3f8ee0, #63a9ec)",
    rowBackground: "#f6f9fd",
    mutedCount: "#8fb4dd",
  },
  {
    accent: "#7c4ff0",
    gradient: "linear-gradient(90deg, #7c4ff0, #9b6bf5)",
    rowBackground: "#f8f6fd",
    mutedCount: "#b09ae2",
  },
];
// Files of no class of the profile ("Unknown" from getMaterialType, or a class the profile does
// not list). Amber / gold accent.
const UNKNOWN_COLORS = {
  accent: "#E0A32E",
  gradient: "linear-gradient(90deg, #E0A32E, #F2C55C)",
  rowBackground: "#fdf9ef",
  mutedCount: "#e6cb93",
};
const colorsOf = (row) => (row.slot >= 0 ? SLOT_COLORS[row.slot] : UNKNOWN_COLORS);

const ProductionPrintCard = () => {
  const files = useStore((state) => state.files);
  const fabricConfig = useStore((state) => state.fabricConfig);
  const shopProfile = useStore((state) => state.shopProfile);
  const lastFilesRefreshAt = useStore((state) => state.lastFilesRefreshAt);
  const [now, setNow] = useState(() => Date.now());

  // Bar shares reflect each class's share of total printed LENGTH (meters), not file count.
  const { rows, totalLength, fileCount } = useMemo(
    () => inboxClassSplit(files, shopProfile, fabricConfig),
    [files, shopProfile, fabricConfig],
  );

  useEffect(() => {
    if (!lastFilesRefreshAt) return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [lastFilesRefreshAt]);

  const lastRefreshLabel = useMemo(() => {
    if (!lastFilesRefreshAt) return "not available";

    const refreshedAt = new Date(lastFilesRefreshAt).getTime();

    if (Number.isNaN(refreshedAt)) return "not available";

    const diffMs = Math.max(0, now - refreshedAt);
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} d ago`;
  }, [lastFilesRefreshAt, now]);

  return (
    <div className={style.card}>
      <div className={style.card_header}>
        <div>
          <span className={style.card_micro_label}>Storage split</span>
          <h2 className={style.card_title}>Inbox</h2>
        </div>
        <div className={style.card_header_right}>
          <span className={style.card_total}>~{totalLength} m</span>
          <span className={style.card_total_sub}>
            {fileCount} {fileCount === 1 ? "file" : "files"} total
          </span>
        </div>
      </div>

      <div className={style.card_bar}>
        {rows.map((row) => (
          <div
            key={row.name}
            className={style.card_bar_segment}
            style={{ width: `${row.share}%`, background: colorsOf(row).gradient }}
            title={`${row.name} · ~${row.length} m`}
          />
        ))}
      </div>
      <div className={style.card_bar_labels}>
        {rows.map((row) => (
          <span key={row.name} className={style.card_bar_label} style={{ width: `${row.share}%`, color: colorsOf(row).accent }}>
            {Math.round(row.share)}%
          </span>
        ))}
      </div>

      <div className={style.card_material_container}>
        {rows.map((row) => {
          const colors = colorsOf(row);
          return (
            <div key={row.name} className={style.card_material_row} style={{ background: colors.rowBackground }}>
              <div className={style.card_material_left}>
                <span className={style.card_material_swatch} style={{ backgroundColor: colors.accent }} />
                <span className={style.card_material_name}>{row.name}</span>
              </div>
              <div className={style.card_material_right}>
                <span className={style.card_material_count} style={{ color: colors.mutedCount }}>
                  {row.count} {row.count === 1 ? "file" : "files"}
                </span>
                <span className={style.card_material_value} style={{ color: colors.accent }}>
                  ~{row.length} m
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={style.card_footer}>
        <LuAlarmClock className={style.card_footer_icon} />
        <span className={style.card_footer_text}>Last refresh · {lastRefreshLabel}</span>
      </div>
    </div>
  );
};

export default ProductionPrintCard;
