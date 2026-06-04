import { useState } from "react";
import { LuDatabase } from "react-icons/lu";
import { backupDb } from "../../../services/settingsService";
import { notify } from "@/utils/notify";
import styles from "./SettingsView.module.css";

const DatabaseView = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupPath, setLastBackupPath] = useState(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await backupDb();
      if (res.success) {
        setLastBackupPath(res.path);
        notify({ type: "Success", title: "Backup created", message: res.path });
      } else {
        notify({ type: "Error", title: "Backup failed", message: res.error || "Unknown error." });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className={styles.view}>
      <div className={styles.view_header}>
        <h2 className={styles.view_title}>Database</h2>
        <p className={styles.view_desc}>Manual backup of ripflow.db. Backups are also created automatically on each app start.</p>
      </div>
      <div className={styles.view_body}>
        <div className={styles.field}>
          <label className={styles.label}>Backup Location</label>
          <p className={styles.hint}>
            %APPDATA%\ripflow-desktop\backups\ — one file per day (ripflow_YYYY-MM-DD.db), last 7 days kept.
          </p>
          {lastBackupPath && (
            <p className={styles.hint} style={{ color: "var(--text-primary)", marginTop: 4 }}>
              {lastBackupPath}
            </p>
          )}
        </div>
      </div>
      <div className={styles.view_footer}>
        <button className={styles.save_btn} onClick={handleBackup} disabled={isBackingUp}>
          <LuDatabase size={15} />
          {isBackingUp ? "Backing up…" : "Backup Now"}
        </button>
      </div>
    </div>
  );
};

export default DatabaseView;
