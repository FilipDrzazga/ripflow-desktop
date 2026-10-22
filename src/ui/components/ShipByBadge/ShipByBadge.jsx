import { LuCalendarClock } from "react-icons/lu";
import { shipByBadge } from "../../utils/etsyShipBadge";
import styles from "./ShipByBadge.module.css";

// "Ship by Mon 27 Oct", coloured by how close the day is (plan ETA-2). Presentational: it gets the epoch seconds of
// the order's date (or nothing) and renders nothing for a missing or unusable one - no empty space, no placeholder.
// The clock is read at render; the lists it sits in re-render on their own polls, which is how a day that turned
// over becomes red.
const ShipByBadge = ({ seconds, className = "" }) => {
  const badge = shipByBadge(seconds);
  if (!badge) return null;
  return (
    <span className={`${styles.badge} ${styles[badge.tone]} ${className}`.trim()} title={badge.title} data-ship-tone={badge.tone}>
      <LuCalendarClock size={12} />
      {badge.text}
    </span>
  );
};

export default ShipByBadge;
