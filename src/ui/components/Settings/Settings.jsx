import { useEffect, useState } from "react";
import GeneralView from "./views/GeneralView";
import PathsView from "./views/PathsView";
import FabricsView from "./views/FabricsView";
import RollbackReasonsView from "./views/RollbackReasonsView";
import ShopProfileView from "./views/ShopProfileView";
import DatabaseView from "./views/DatabaseView";
import MaintenanceView from "./views/MaintenanceView";
import UpdatesView from "./views/UpdatesView";
import { SECTION_GROUPS, DEFAULT_SECTION } from "./settingsSections";
import { getSettings } from "../../services/settingsService";
import { getAppVersion } from "../../services/updateService";
import styles from "./Settings.module.css";

const VIEWS = {
  general: GeneralView,
  paths: PathsView,
  fabrics: FabricsView,
  rollbackReasons: RollbackReasonsView,
  shopProfile: ShopProfileView,
  database: DatabaseView,
  maintenance: MaintenanceView,
  updates: UpdatesView,
};

const Settings = () => {
  const [activeSection, setActiveSection] = useState(DEFAULT_SECTION);
  const [appVersion, setAppVersion] = useState(null);
  const [workstationName, setWorkstationName] = useState(null);
  const ActiveView = VIEWS[activeSection];

  useEffect(() => {
    getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  // Re-read on every section change: General renames the station, and the footer must not keep
  // showing the old name until Settings is reopened.
  useEffect(() => {
    getSettings()
      .then((res) => setWorkstationName(res?.success ? res.settings?.workstationName || null : null))
      .catch(() => setWorkstationName(null));
  }, [activeSection]);

  const renderGroup = (group) => (
    <div key={group.id} className={styles.sidebar_group}>
      <span className={styles.sidebar_group_title}>{group.title}</span>
      {group.sections.map((section) => {
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
    </div>
  );

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <nav className={styles.sidebar_nav}>{SECTION_GROUPS.filter((g) => !g.bottom).map(renderGroup)}</nav>
        <nav className={`${styles.sidebar_nav} ${styles.sidebar_bottom}`}>
          {SECTION_GROUPS.filter((g) => g.bottom).map(renderGroup)}
        </nav>
        <div className={styles.sidebar_footer}>
          <span className={styles.sidebar_footer_station} title="Workstation name (Settings > General)">
            {workstationName ?? "-"}
          </span>
          <span className={styles.sidebar_footer_version}>{appVersion ? `RipFlow v${appVersion}` : "RipFlow"}</span>
        </div>
      </aside>
      <div className={styles.content}>
        <ActiveView />
      </div>
    </div>
  );
};

export default Settings;
