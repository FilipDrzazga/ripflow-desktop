import style from "./OthersTooltip.module.css";
import { formatPercentage } from "./formatPercentage";

// Hover list under a bar row: children are the row, items the groups behind it
// ({ label, percentage, length, color? } - a dot colour per item, else dotColor).
const OthersTooltip = ({ children, items, dotColor, title = "Remaining materials" }) => {
  return (
    <div className={style.tooltip}>
      {children}
      <div className={style.tooltip_content}>
        <span className={style.tooltip_title}>{title}</span>
        <div className={style.tooltip_list}>
          {items.map((item) => (
            <div key={item.label} className={style.tooltip_item}>
              <div className={style.tooltip_item_box}>
                <span className={style.tooltip_item_dot} style={{ backgroundColor: item.color ?? dotColor }} />
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
