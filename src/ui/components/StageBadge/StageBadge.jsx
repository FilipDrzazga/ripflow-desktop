import { STAGE_LABEL, STAGE_COLOR } from "../../../shared/constants";
import style from "./StageBadge.module.css";

const StageBadge = ({ stage }) => {
  if (!stage) return null;
  const label = STAGE_LABEL[stage] ?? stage;
  const colors = STAGE_COLOR[stage] ?? { bg: "#f0f0f0", color: "#616161" };

  return (
    <span
      className={style.badge}
      style={{ backgroundColor: colors.bg, color: colors.color }}
    >
      {label}
    </span>
  );
};

export default StageBadge;
