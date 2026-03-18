import { useEffect, useMemo, useState } from "react";
import style from "./ProductionOverviewCard.module.css";
import { useStore } from "../../../store/useStore";
import { estimateMaterialLengthByGroups } from "../../../helpers/estimatePrintLength";
import { LuAlarmClock } from "react-icons/lu";

const MATERIAL_COLORS = {
  Cottons: {
    bar: "#57b8f6",
    badgeBackground: "#daeaff",
    badgeText: "#2477f7",
  },
  Polyesters: {
    bar: "#7c4dff",
    badgeBackground: "#f4e7ff",
    badgeText: "#b542ff",
  },
  Unknown: {
    bar: "#fbbf24",
    badgeBackground: "#fff7c1",
    badgeText: "#ecb809",
  },
};

const ProductionPrintCard = () => {
  const store = useStore();
  const files = useStore((state) => state.files);
  const allItems = store.files.flatMap((group) => group.items);
  const lastFilesRefreshAt = useStore((state) => state.lastFilesRefreshAt);
  const [now, setNow] = useState(() => Date.now());

  const materialStats = useMemo(() => {
    const materialCounts = allItems.reduce((acc, item) => {
      const key = item.materialType || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(materialCounts)
      .map(([label, count]) => ({
        label,
        count,
        percentage: allItems.length ? (count / allItems.length) * 100 : 0,
        colors: MATERIAL_COLORS[label] || MATERIAL_COLORS.Unknown,
      }))
      .sort((a, b) => b.count - a.count);
  }, [allItems]);

  const materialLengths = useMemo(() => {
    return {
      Cottons: estimateMaterialLengthByGroups(files, "Cottons"),
      Polyesters: estimateMaterialLengthByGroups(files, "Polyesters"),
      Unknown: estimateMaterialLengthByGroups(files, "Unknown"),
    };
  }, [files]);

  const cottonsShare = materialStats.find((material) => material.label === "Cottons")?.percentage ?? 0;
  const polyestersShare = materialStats.find((material) => material.label === "Polyesters")?.percentage ?? 0;
  const cottonsLength = materialLengths.Cottons ?? 0;
  const polyestersLength = materialLengths.Polyesters ?? 0;
  const cottonsCount = materialStats.find((material) => material.label === "Cottons")?.count ?? 0;
  const polyestersCount = materialStats.find((material) => material.label === "Polyesters")?.count ?? 0;

  useEffect(() => {
    if (!lastFilesRefreshAt) return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [lastFilesRefreshAt]);

  const lastRefreshLabel = useMemo(() => {
    if (!lastFilesRefreshAt) return "Last refresh: not available";

    const refreshedAt = new Date(lastFilesRefreshAt).getTime();

    if (Number.isNaN(refreshedAt)) return "Last refresh: not available";

    const diffMs = Math.max(0, now - refreshedAt);
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "Last refresh: just now";
    if (diffMinutes < 60) return `Last refresh: ${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Last refresh: ${diffHours} h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `Last refresh: ${diffDays} d ago`;
  }, [lastFilesRefreshAt, now]);

  return (
    <div className={style.card}>
      <div className={style.card_content}>
        <div className={style.card_header}>
          <span className={style.card_header_title}>Inbox</span>
          <span className={style.card_header_value}>{allItems.length} Files</span>
        </div>
        <div className={style.card_bar}>
          {materialStats.map((material) => (
            <div
              key={material.label}
              className={style.card_bar_segment}
              style={{ width: `${material.percentage}%`, backgroundColor: material.colors.bar }}
            />
          ))}
        </div>
        <div className={style.card_material_container}>
          <div className={style.card_material_group}>
            <div className={style.card_material_box}>
              <span className={style.card_material_dot} style={{ backgroundColor: MATERIAL_COLORS.Cottons.bar }} />
              <span className={style.card_material_label}>Cottons</span>
              <span className={style.card_material_sum}>{Math.round(cottonsShare)}%</span>
            </div>
            <div
              className={style.card_material_metric}
              style={{ background: MATERIAL_COLORS.Cottons.badgeBackground, color: MATERIAL_COLORS.Cottons.badgeText }}
            >
              <span className={style.card_material_metric_sum}>~{cottonsLength} m</span>
            </div>
            <div
              className={style.card_material_metric}
              style={{ background: MATERIAL_COLORS.Cottons.badgeBackground, color: MATERIAL_COLORS.Cottons.badgeText }}
            >
              <span className={style.card_material_metric_sum}>
                {cottonsCount} {cottonsCount > 1 ? "files" : "file"}
              </span>
            </div>
          </div>
          <div className={style.card_material_group}>
            <div className={style.card_material_box}>
              <span className={style.card_material_dot} style={{ backgroundColor: MATERIAL_COLORS.Polyesters.bar }} />
              <span className={style.card_material_label}>Polyesters</span>
              <span className={style.card_material_sum}>{Math.round(polyestersShare)}%</span>
            </div>
            <div
              className={style.card_material_metric}
              style={{
                background: MATERIAL_COLORS.Polyesters.badgeBackground,
                color: MATERIAL_COLORS.Polyesters.badgeText,
              }}
            >
              <span className={style.card_material_metric_sum}>~{polyestersLength} m</span>
            </div>

            <div
              className={style.card_material_metric}
              style={{
                background: MATERIAL_COLORS.Polyesters.badgeBackground,
                color: MATERIAL_COLORS.Polyesters.badgeText,
              }}
            >
              <span className={style.card_material_metric_sum}>
                {polyestersCount} {polyestersCount > 1 ? "files" : "file"}
              </span>
            </div>
          </div>
        </div>
        <div className={style.card_footer}>
          <LuAlarmClock className={style.card_footer_icon} />
          <span className={style.card_footer_text}>{lastRefreshLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default ProductionPrintCard;
