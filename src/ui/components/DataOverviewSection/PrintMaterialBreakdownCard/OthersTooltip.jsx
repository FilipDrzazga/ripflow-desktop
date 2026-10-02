import style from "./OthersTooltip.module.css";

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
};

const OthersTooltip = ({ children, items, dotColor }) => {
  return (
    <div className={style.tooltip}>
      {children}
      <div className={style.tooltip_content}>
        <span className={style.tooltip_title}>Remaining materials</span>
        <div className={style.tooltip_list}>
          {items.map((item) => (
            <div key={item.label} className={style.tooltip_item}>
              <div className={style.tooltip_item_box}>
                <span className={style.tooltip_item_dot} style={{ backgroundColor: dotColor }} />
                <span className={style.tooltip_item_label}>{item.label}</span>
              </div>
              <div className={style.tooltip_item_values}>
                <span className={style.tooltip_item_percent}>{formatPercentage(item.percentage)}</span>
                <span className={style.tooltip_item_sum}>~{item.length} m</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OthersTooltip;
