import { useMemo } from "react";
import style from "./PrintMaterialBreakdownCard.module.css";
import OthersTooltip from "./OthersTooltip";
import { useStore } from "../../../store/useStore";
import { estimatePrintLength } from "../../../../shared/estimatePrintLength";

const MATERIAL_SECTIONS = [
  {
    label: "Cottons",
    palette: ["#2f9be8", "#57b8f6", "#88d1ff"],
    othersColor: "#b8defa",
    badgeBackground: "#deefff",
    badgeText: "#226fc8",
  },
  {
    label: "Polyesters",
    palette: ["#6c57ff", "#8f76ff", "#b39eff"],
    othersColor: "#ddd1ff",
    badgeBackground: "#f4e7ff",
    badgeText: "#b542ff",
  },
];

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
};

const getSectionData = (files, materialType, sectionConfig) => {
  const sortedGroups = files
    .filter((group) => group.items.some((item) => item.materialType === materialType))
    .map((group) => {
      const groupItems = group.items.filter((item) => item.materialType === materialType);
      const length = estimatePrintLength(groupItems).fixedTotalLengthM;

      return {
        label: group.printGroup,
        length,
      };
    })
    .filter((group) => group.length > 0)
    .sort((a, b) => b.length - a.length);

  const totalLength = sortedGroups.reduce((sum, group) => sum + group.length, 0);
  const topGroups = sortedGroups.slice(0, 3).map((group, index) => ({
    ...group,
    color: sectionConfig.palette[index % sectionConfig.palette.length],
    percentage: totalLength > 0 ? (group.length / totalLength) * 100 : 0,
  }));

  const remainingGroups = sortedGroups.slice(3).map((group) => ({
    ...group,
    percentage: totalLength > 0 ? (group.length / totalLength) * 100 : 0,
  }));

  const othersLength = remainingGroups.reduce((sum, group) => sum + group.length, 0);
  const othersPercentage = totalLength > 0 ? (othersLength / totalLength) * 100 : 0;

  const displayGroups =
    remainingGroups.length > 0
      ? [
          ...topGroups,
          {
            label: "Others",
            length: Number(othersLength.toFixed(2)),
            percentage: othersPercentage,
            color: sectionConfig.othersColor,
            othersCount: remainingGroups.length,
            isOthers: true,
          },
        ]
      : topGroups;

  return {
    groups: sortedGroups,
    displayGroups,
    remainingGroups,
    totalLength: Number(totalLength.toFixed(2)),
  };
};

const PrintMaterialBreakdownCard = () => {
  const files = useStore((state) => state.files);

  const sections = useMemo(
    () =>
      MATERIAL_SECTIONS.map((section) => ({
        ...section,
        ...getSectionData(files, section.label, section),
      })),
    [files],
  );

  return (
    <div className={style.card}>
      <div className={style.card_content}>
        <div className={style.card_columns}>
          {sections.map((section, index) => (
            <div
              key={section.label}
              className={`${style.card_column} ${index === 0 ? style.card_column_divider : ""}`.trim()}
            >
              <div className={style.card_column_header}>
                <span className={style.card_column_title}>{section.label}</span>
                <div
                  className={style.card_column_metric}
                  style={{ background: section.badgeBackground, color: section.badgeText }}
                >
                  <span className={style.card_column_metric_sum}>~{section.totalLength} m</span>
                </div>
              </div>
              <div className={style.card_bar}>
                {section.displayGroups.map((group) => (
                  <div
                    key={group.label}
                    className={style.card_bar_segment}
                    style={{ width: `${group.percentage}%`, backgroundColor: group.color }}
                  />
                ))}
              </div>
              <div className={style.card_material_container}>
                {section.displayGroups.map((group) => {
                  const rowContent = (
                    <div className={style.card_material_group}>
                      <div className={style.card_material_box}>
                        <span className={style.card_material_dot} style={{ backgroundColor: group.color }} />
                        <span className={style.card_material_label}>{group.label}</span>
                        {group.isOthers && <span className={style.card_material_extra}>+{group.othersCount}</span>}
                      </div>
                      <span className={style.card_material_sum}>{formatPercentage(group.percentage)}</span>
                      <div
                        className={style.card_material_metric}
                        style={{ background: section.badgeBackground, color: section.badgeText }}
                      >
                        <span className={style.card_material_metric_sum}>~{group.length} m</span>
                      </div>
                    </div>
                  );

                  if (!group.isOthers) {
                    return <div key={group.label}>{rowContent}</div>;
                  }

                  return (
                    <OthersTooltip
                      key={group.label}
                      items={section.remainingGroups}
                      badgeBackground={section.badgeBackground}
                      badgeText={section.badgeText}
                    >
                      {rowContent}
                    </OthersTooltip>
                  );
                })}
                {section.groups.length === 0 && (
                  <div className={style.card_empty_state}>
                    <span className={style.card_empty_state_text}>No materials available</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrintMaterialBreakdownCard;
