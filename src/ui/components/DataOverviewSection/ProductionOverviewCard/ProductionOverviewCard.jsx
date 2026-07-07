import { useEffect, useMemo, useState } from "react";
import style from "./ProductionOverviewCard.module.css";
import { useStore } from "../../../store/useStore";
import { estimateMaterialLengthByGroups } from "../../../../shared/estimatePrintLength";
import { LuAlarmClock } from "react-icons/lu";

const MATERIAL_COLORS = {
  Cottons: {
    accent: "#3f8ee0",
    gradient: "linear-gradient(90deg, #3f8ee0, #63a9ec)",
    rowBackground: "#f6f9fd",
    mutedCount: "#8fb4dd",
  },
  Polyesters: {
    accent: "#7c4ff0",
    gradient: "linear-gradient(90deg, #7c4ff0, #9b6bf5)",
    rowBackground: "#f8f6fd",
    mutedCount: "#b09ae2",
  },
  // Files whose material couldn't be parsed (getMaterialType → "Unknown").
  // Amber / gold accent.
  Unknown: {
    accent: "#E0A32E",
    gradient: "linear-gradient(90deg, #E0A32E, #F2C55C)",
    rowBackground: "#fdf9ef",
    mutedCount: "#e6cb93",
  },
};

const ProductionPrintCard = () => {
  const files = useStore((state) => state.files);
  const lastFilesRefreshAt = useStore((state) => state.lastFilesRefreshAt);
  const [now, setNow] = useState(() => Date.now());
  const allItems = useMemo(() => files.flatMap((group) => group.items), [files]);

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

  const cottonsLength = materialLengths.Cottons ?? 0;
  const polyestersLength = materialLengths.Polyesters ?? 0;
  const unknownLength = materialLengths.Unknown ?? 0;
  const cottonsCount = materialStats.find((material) => material.label === "Cottons")?.count ?? 0;
  const polyestersCount = materialStats.find((material) => material.label === "Polyesters")?.count ?? 0;
  const unknownCount = materialStats.find((material) => material.label === "Unknown")?.count ?? 0;
  const lengthTotal = cottonsLength + polyestersLength + unknownLength;
  const totalLength = Number(lengthTotal.toFixed(2));

  // Bar shares reflect each material's share of total printed LENGTH (meters), not file count.
  const cottonsShare = lengthTotal ? (cottonsLength / lengthTotal) * 100 : 0;
  const polyestersShare = lengthTotal ? (polyestersLength / lengthTotal) * 100 : 0;
  const unknownShare = lengthTotal ? (unknownLength / lengthTotal) * 100 : 0;

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
            {allItems.length} {allItems.length === 1 ? "file" : "files"} total
          </span>
        </div>
      </div>

      <div className={style.card_bar}>
        <div
          className={style.card_bar_segment}
          style={{ width: `${cottonsShare}%`, background: MATERIAL_COLORS.Cottons.gradient }}
          title={`Cottons · ~${cottonsLength} m`}
        />
        <div
          className={style.card_bar_segment}
          style={{ width: `${polyestersShare}%`, background: MATERIAL_COLORS.Polyesters.gradient }}
          title={`Polyesters · ~${polyestersLength} m`}
        />
        {unknownCount > 0 && (
          <div
            className={style.card_bar_segment}
            style={{ width: `${unknownShare}%`, background: MATERIAL_COLORS.Unknown.gradient }}
            title={`Unknown · ~${unknownLength} m`}
          />
        )}
      </div>
      <div className={style.card_bar_labels}>
        <span className={style.card_bar_label} style={{ width: `${cottonsShare}%`, color: MATERIAL_COLORS.Cottons.accent }}>
          {Math.round(cottonsShare)}%
        </span>
        <span
          className={style.card_bar_label}
          style={{ width: `${polyestersShare}%`, color: MATERIAL_COLORS.Polyesters.accent }}
        >
          {Math.round(polyestersShare)}%
        </span>
        {unknownCount > 0 && (
          <span
            className={style.card_bar_label}
            style={{ width: `${unknownShare}%`, color: MATERIAL_COLORS.Unknown.accent }}
          >
            {Math.round(unknownShare)}%
          </span>
        )}
      </div>

      <div className={style.card_material_container}>
        <div className={style.card_material_row} style={{ background: MATERIAL_COLORS.Cottons.rowBackground }}>
          <div className={style.card_material_left}>
            <span className={style.card_material_swatch} style={{ backgroundColor: MATERIAL_COLORS.Cottons.accent }} />
            <span className={style.card_material_name}>Cottons</span>
          </div>
          <div className={style.card_material_right}>
            <span className={style.card_material_count} style={{ color: MATERIAL_COLORS.Cottons.mutedCount }}>
              {cottonsCount} {cottonsCount === 1 ? "file" : "files"}
            </span>
            <span className={style.card_material_value} style={{ color: MATERIAL_COLORS.Cottons.accent }}>
              ~{cottonsLength} m
            </span>
          </div>
        </div>
        <div className={style.card_material_row} style={{ background: MATERIAL_COLORS.Polyesters.rowBackground }}>
          <div className={style.card_material_left}>
            <span
              className={style.card_material_swatch}
              style={{ backgroundColor: MATERIAL_COLORS.Polyesters.accent }}
            />
            <span className={style.card_material_name}>Polyesters</span>
          </div>
          <div className={style.card_material_right}>
            <span className={style.card_material_count} style={{ color: MATERIAL_COLORS.Polyesters.mutedCount }}>
              {polyestersCount} {polyestersCount === 1 ? "file" : "files"}
            </span>
            <span className={style.card_material_value} style={{ color: MATERIAL_COLORS.Polyesters.accent }}>
              ~{polyestersLength} m
            </span>
          </div>
        </div>
        {unknownCount > 0 && (
          <div className={style.card_material_row} style={{ background: MATERIAL_COLORS.Unknown.rowBackground }}>
            <div className={style.card_material_left}>
              <span className={style.card_material_swatch} style={{ backgroundColor: MATERIAL_COLORS.Unknown.accent }} />
              <span className={style.card_material_name}>Unknown</span>
            </div>
            <div className={style.card_material_right}>
              <span className={style.card_material_count} style={{ color: MATERIAL_COLORS.Unknown.mutedCount }}>
                {unknownCount} {unknownCount === 1 ? "file" : "files"}
              </span>
              <span className={style.card_material_value} style={{ color: MATERIAL_COLORS.Unknown.accent }}>
                ~{unknownLength} m
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={style.card_footer}>
        <LuAlarmClock className={style.card_footer_icon} />
        <span className={style.card_footer_text}>Last refresh · {lastRefreshLabel}</span>
      </div>
    </div>
  );
};

export default ProductionPrintCard;
