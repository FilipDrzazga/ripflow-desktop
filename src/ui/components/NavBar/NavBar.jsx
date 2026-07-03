import {
  PiPrinter, PiPrinterFill,
  PiStack, PiStackFill,
  PiClipboardText, PiClipboardTextFill,
  PiFactory, PiFactoryFill,
  PiChartBar, PiChartBarFill,
  PiScroll, PiScrollFill,
  PiGear, PiGearFill,
} from "react-icons/pi";
import styles from "./NavBar.module.css";

const TOP_ITEMS = [
  { id: "print",       label: "Print",         icon: PiPrinter,       iconActive: PiPrinterFill },
  { id: "batch",       label: "Batch",         icon: PiStack,         iconActive: PiStackFill },
  { id: "production",  label: "Production",    icon: PiClipboardText, iconActive: PiClipboardTextFill },
  { id: "customOrder", label: "Custom Orders", icon: PiFactory,       iconActive: PiFactoryFill },
];

const NavBar = ({ activeView, onViewChange }) => {
  return (
    <nav className={styles.navbar}>
      <div className={styles.nav_top}>
        {TOP_ITEMS.map(({ id, label, icon: Icon, iconActive: IconActive }) => {
          const isActive = activeView === id;
          const TabIcon = isActive ? IconActive : Icon;
          return (
            <button
              key={id}
              className={`${styles.nav_item} ${isActive ? styles.active : ""}`}
              onClick={() => onViewChange(id)}
            >
              <TabIcon className={styles.nav_icon} />
              <span className={styles.nav_label}>{label}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.nav_bottom}>
        <button
          className={`${styles.nav_item} ${activeView === "analytics" ? styles.active : ""}`}
          onClick={() => onViewChange("analytics")}
        >
          {activeView === "analytics" ? <PiChartBarFill className={styles.nav_icon} /> : <PiChartBar className={styles.nav_icon} />}
          <span className={styles.nav_label}>Analytics</span>
        </button>
        <div className={styles.nav_divider} />
        <button
          className={`${styles.nav_item} ${activeView === "logs" ? styles.active : ""}`}
          onClick={() => onViewChange("logs")}
        >
          {activeView === "logs" ? <PiScrollFill className={styles.nav_icon} /> : <PiScroll className={styles.nav_icon} />}
          <span className={styles.nav_label}>Logs</span>
        </button>
        <button
          className={`${styles.nav_item} ${activeView === "settings" ? styles.active : ""}`}
          onClick={() => onViewChange("settings")}
        >
          {activeView === "settings" ? <PiGearFill className={styles.nav_icon} /> : <PiGear className={styles.nav_icon} />}
          <span className={styles.nav_label}>Settings</span>
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
