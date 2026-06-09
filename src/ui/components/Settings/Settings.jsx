import { useState } from "react";
import { LuSettings2, LuFolderOpen, LuLayers, LuRotateCcw, LuDatabase, LuWrench } from "react-icons/lu";
import GeneralView from "./views/GeneralView";
import PathsView from "./views/PathsView";
import FabricsView from "./views/FabricsView";
import RollbackReasonsView from "./views/RollbackReasonsView";
import DatabaseView from "./views/DatabaseView";
import MaintenanceView from "./views/MaintenanceView";
import styles from "./Settings.module.css";

const SECTIONS = [
  { id: "general", label: "General", icon: LuSettings2 },
  { id: "paths", label: "Paths", icon: LuFolderOpen },
  { id: "fabrics", label: "Fabrics", icon: LuLayers },
  { id: "rollbackReasons", label: "Rollback Reasons", icon: LuRotateCcw },
  { id: "database", label: "Database", icon: LuDatabase },
  { id: "maintenance", label: "Maintenance", icon: LuWrench },
];

const VIEWS = {
  general: GeneralView,
  paths: PathsView,
  fabrics: FabricsView,
  rollbackReasons: RollbackReasonsView,
  database: DatabaseView,
  maintenance: MaintenanceView,
};

const Settings = () => {
  const [activeSection, setActiveSection] = useState("general");
  const ActiveView = VIEWS[activeSection];

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <nav className={styles.sidebar_nav}>
          {SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            return (
              <button
                key={section.id}
                className={`${styles.sidebar_item} ${activeSection === section.id ? styles.active : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <SectionIcon size={16} className={styles.sidebar_icon} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className={styles.content}>
        <ActiveView />
      </div>
    </div>
  );
};

export default Settings;
