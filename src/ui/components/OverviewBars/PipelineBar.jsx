import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { PRODUCTION_STAGE, STAGE_COLOR, STAGE_LABEL } from "../../../shared/constants";
import { STAGE_ICON } from "../../constants/stageIcons";
import { pipelineBarData } from "../../utils/overviewBars";
import GooBar from "./GooBar";
import style from "./OverviewBars.module.css";

const PipelineBar = ({ onNavigate }) => {
  const productionStages = useStore((state) => state.productionStages);
  const stageHistory = useStore((state) => state.stageHistory);

  const { stages, total, segments, shippedToday } = useMemo(
    () => pipelineBarData(productionStages, stageHistory),
    [productionStages, stageHistory],
  );

  const barSegments = useMemo(
    () =>
      segments.map((segment) => ({
        key: segment.key,
        weight: segment.share,
        color: STAGE_COLOR[segment.key].color,
        title: `${segment.label} · ${segment.count}`,
      })),
    [segments],
  );

  const shippedColors = STAGE_COLOR[PRODUCTION_STAGE.SHIPPED];
  const ShippedIcon = STAGE_ICON[PRODUCTION_STAGE.SHIPPED];

  return (
    <div className={style.card}>
      <div className={style.card_header}>
        <div className={style.card_heading}>
          <h2 className={style.card_title}>Production pipeline</h2>
          <span className={style.card_sub}>in progress</span>
        </div>
        <span className={style.card_total}>{total}</span>
      </div>

      <GooBar segments={barSegments} label="Files per production stage" />

      <div className={style.chips}>
        {stages.map(({ key, label, count }) => {
          const colors = STAGE_COLOR[key];
          const Icon = STAGE_ICON[key];
          return (
            <button
              key={key}
              type="button"
              className={`${style.chip} ${count === 0 ? style.chip_zero : ""}`.trim()}
              style={{ backgroundColor: colors.bg, color: colors.color }}
              onClick={() => onNavigate?.("production")}
              title={label}
            >
              {Icon && <Icon className={style.chip_icon} />}
              <span className={style.chip_count}>{count}</span>
            </button>
          );
        })}
        {/* shipped: a daily flow, kept apart from the chain of current states */}
        <span className={style.chip_divider} />
        <button
          type="button"
          className={`${style.chip} ${shippedToday === 0 ? style.chip_zero : ""}`.trim()}
          style={{ backgroundColor: shippedColors.bg, color: shippedColors.color }}
          onClick={() => onNavigate?.("production")}
          title={`${STAGE_LABEL.shipped} today`}
        >
          {ShippedIcon && <ShippedIcon className={style.chip_icon} />}
          <span className={style.chip_count}>{shippedToday}</span>
        </button>
      </div>
    </div>
  );
};

export default PipelineBar;
