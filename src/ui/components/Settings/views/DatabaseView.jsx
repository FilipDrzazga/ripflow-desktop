import { useState } from "react";
import { LuDatabase, LuFileArchive } from "react-icons/lu";
import { backupDb } from "../../../services/settingsService";
import { exportDiagnostics } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import styles from "./SettingsView.module.css";

const DatabaseView = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupPath, setLastBackupPath] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportDiagnostics = async () => {
    setIsExporting(true);
    try {
      const res = await exportDiagnostics();
      if (res?.canceled) return;
      notify(
        res?.success
          ? { type: "Success", title: "Diagnostics exported", message: res.path }
          : { type: "Error", title: "Export failed", message: res?.error || "Unknown error." },
      );
    } catch (err) {
      notify({ type: "Error", title: "Export failed", message: err?.message || "Unknown error." });
    } finally {
      setIsExporting(false);
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
        {/* ETAP 4 (4-diag): the file to send when something is wrong - nothing is sent by the app */}
        <div className={styles.action_row}>
          <div className={styles.action_info}>
            <span className={styles.label}>Export diagnostics</span>
            <p className={styles.hint}>
              A zip with versions, this station&apos;s settings, a check that its folders can be read, the last 500
              logs and the shop profile - no file contents. The logs hold file names (customer names, order
              numbers): send it only to your support.
            </p>
          </div>
          <button className={styles.browse_btn} onClick={handleExportDiagnostics} disabled={isExporting}>
            <LuFileArchive size={15} />
            {isExporting ? "Exporting…" : "Export"}
          </button>
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
