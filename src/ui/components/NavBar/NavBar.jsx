import { LuPrinter, LuLayers, LuScrollText, LuSettings, LuBarChart2, LuClipboardList } from "react-icons/lu";
import styles from "./NavBar.module.css";

const TOP_ITEMS = [
  { id: "print", label: "Print", icon: LuPrinter },
  { id: "batch", label: "Batch", icon: LuLayers },
  { id: "custom_order", label: "Custom Order", icon: LuClipboardList },
];

const BOTTOM_ITEMS = [
  { id: "analytics", label: "Analytics", icon: LuBarChart2 },
  { id: "logs", label: "Logs", icon: LuScrollText },
  { id: "settings", label: "Settings", icon: LuSettings },
];

const NavBar = ({ activeView, onViewChange }) => {
  return (
    <nav className={styles.navbar}>
      <div className={styles.nav_top}>
        {TOP_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.nav_item} ${activeView === id ? styles.active : ""}`}
            onClick={() => onViewChange(id)}
          >
            <Icon className={styles.nav_icon} />
            <span className={styles.nav_label}>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.nav_bottom}>
        {BOTTOM_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.nav_item} ${activeView === id ? styles.active : ""}`}
            onClick={() => onViewChange(id)}
          >
            <Icon className={styles.nav_icon} />
            <span className={styles.nav_label}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default NavBar;
