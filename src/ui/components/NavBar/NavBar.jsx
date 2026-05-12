import { LuPrinter, LuLayers, LuScrollText, LuSettings } from "react-icons/lu";
import styles from "./NavBar.module.css";

const TOP_ITEMS = [
  { id: "print", label: "Print", icon: LuPrinter },
  { id: "batch", label: "Batch", icon: LuLayers },
  { id: "logs", label: "Logs", icon: LuScrollText },
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
        <button
          className={`${styles.nav_item} ${activeView === "settings" ? styles.active : ""}`}
          onClick={() => onViewChange("settings")}
        >
          <LuSettings className={styles.nav_icon} />
          <span className={styles.nav_label}>Settings</span>
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
