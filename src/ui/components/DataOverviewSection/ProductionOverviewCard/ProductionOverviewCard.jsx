import { useMemo } from "react";
import style from "./ProductionOverviewCard.module.css";
import { useStore } from "../../../store/useStore";
import { estimatePrintLength } from "../../../helpers/estimatePrintLength";

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
  const allItems = store.files.flatMap((group) => group.items);

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
    const byMaterial = allItems.reduce((acc, item) => {
      const key = item.materialType || "Unknown";
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});

    return Object.entries(byMaterial).reduce((acc, [material, items]) => {
      acc[material] = estimatePrintLength(items).fixedTotalLengthM;
      return acc;
    }, {});
  }, [allItems]);

  const cottonsShare = materialStats.find((material) => material.label === "Cottons")?.percentage ?? 0;
  const polyestersShare = materialStats.find((material) => material.label === "Polyesters")?.percentage ?? 0;
  const cottonsLength = materialLengths.Cottons ?? 0;
  const polyestersLength = materialLengths.Polyesters ?? 0;
  const cottonsCount = materialStats.find((material) => material.label === "Cottons")?.count ?? 0;
  const polyestersCount = materialStats.find((material) => material.label === "Polyesters")?.count ?? 0;

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
              <span className={style.card_material_metric_sum}>{cottonsCount} files</span>
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
              <span className={style.card_material_metric_sum}>{polyestersCount} files</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionPrintCard;
