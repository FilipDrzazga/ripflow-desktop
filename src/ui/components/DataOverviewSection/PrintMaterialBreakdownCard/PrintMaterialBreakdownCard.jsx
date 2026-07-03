import { useMemo } from "react";
import style from "./PrintMaterialBreakdownCard.module.css";
import OthersTooltip from "./OthersTooltip";
import { useStore } from "../../../store/useStore";
import { estimatePrintLength } from "../../../../shared/estimatePrintLength";

const MATERIAL_SECTIONS = [
  {
    label: "Cottons",
    accent: "#2e7fd6",
    palette: ["#2e7fd6", "#4d9de8", "#78b8ef"],
    othersColor: "#b9dbf7",
  },
  {
    label: "Polyesters",
    accent: "#7c4ff0",
    palette: ["#6a3de8", "#8f6bef", "#b298f5"],
    othersColor: "#ddd0fa",
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
    <>
      {sections.map((section) => (
        <div key={section.label} className={style.card}>
          <div className={style.card_header}>
            <div>
              <span className={style.card_micro_label}>Category</span>
              <h2 className={style.card_title}>{section.label}</h2>
            </div>
            <span className={style.card_total} style={{ color: section.accent }}>
              ~{section.totalLength} m
            </span>
          </div>

          <div className={style.card_bar}>
            {section.displayGroups.map((group) => (
              <div
                key={group.label}
                className={style.card_bar_segment}
                style={{ width: `${group.percentage}%`, backgroundColor: group.color }}
                title={`${group.label} · ~${group.length} m`}
              />
            ))}
          </div>

          <div className={style.card_material_container}>
            {section.displayGroups.map((group) => {
              const rowContent = (
                <div className={style.card_material_group}>
                  <div className={style.card_material_box}>
                    <span className={style.card_material_dot} style={{ backgroundColor: group.color }} />
                    <span
                      className={`${style.card_material_label} ${group.isOthers ? style.card_material_label_others : ""}`.trim()}
                    >
                      {group.label}
                    </span>
                    {group.isOthers && <span className={style.card_material_extra}>+{group.othersCount}</span>}
                  </div>
                  <div className={style.card_material_values}>
                    <span className={style.card_material_percent}>{formatPercentage(group.percentage)}</span>
                    <span className={style.card_material_sum}>~{group.length} m</span>
                  </div>
                </div>
              );

              if (!group.isOthers) {
                return <div key={group.label}>{rowContent}</div>;
              }

              return (
                <OthersTooltip key={group.label} items={section.remainingGroups} dotColor={group.color}>
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
    </>
  );
};

export default PrintMaterialBreakdownCard;
