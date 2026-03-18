import style from "./OthersTooltip.module.css";

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
};

const OthersTooltip = ({ children, items, badgeBackground, badgeText }) => {
  return (
    <div className={style.tooltip}>
      {children}
      <div className={style.tooltip_content}>
        <span className={style.tooltip_title}>Remaining materials</span>
        <div className={style.tooltip_list}>
          {items.map((item) => (
            <div key={item.label} className={style.tooltip_item}>
              <span className={style.tooltip_item_label}>{item.label}</span>
              <span className={style.tooltip_item_sum}>{formatPercentage(item.percentage)}</span>
              <div className={style.tooltip_item_metric} style={{ background: badgeBackground, color: badgeText }}>
                <span className={style.tooltip_item_metric_sum}>~{item.length} m</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OthersTooltip;
