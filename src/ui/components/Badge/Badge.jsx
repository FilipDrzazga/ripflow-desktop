import style from "./Badge.module.css";
const badgeArr = [
  { type: "Linear Meter", bgColor: "#f1f5f9", textColor: "#334155" },
  { type: "Fat Quarter", bgColor: "#f1f5f9", textColor: "#334155" },
  { type: "Cushion", bgColor: "#f1f5f9", textColor: "#334155" },
  { type: "Sample", bgColor: "#f1f5f9", textColor: "#334155" },
  { type: "Tea Towel", bgColor: "#f1f5f9", textColor: "#334155" },
  { type: "Polyesters", bgColor: "#f4e7ff", textColor: "#b542ff" },
  { type: "Cottons", bgColor: "#daeaff", textColor: "#2477f7" },
  { type: "READY", bgColor: "#d9fbe5", textColor: "#05c95d" },
  { type: "INVALID", bgColor: "#fff7c1", textColor: "#ecb809" },
  { type: "UNKNOWN", bgColor: "#fff7c1", textColor: "#ecb809" },
  { type: "HOLD", bgColor: "#fff3e0", textColor: "#f97316" },
];

const Badge = ({ type, badgeText }) => {
  return (
    <div className={style.badge_container}>
      {badgeArr.map((badge) => {
        if (badge.type === type) {
          return (
            <div
              key={badge.type}
              className={style.badge}
              style={{ backgroundColor: badge.bgColor, color: badge.textColor }}
            >
              {badgeText.toUpperCase()}
            </div>
          );
        }
      })}
    </div>
  );
};

export default Badge;
