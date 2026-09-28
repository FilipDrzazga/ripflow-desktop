import { useState } from "react";
import { LuDownload, LuUpload } from "react-icons/lu";
import { useStore } from "../../../store/useStore";
import {
  exportShopProfile,
  previewShopProfileImport,
  applyShopProfileImport,
} from "../../../services/profileService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import { PROFILE_STATUS } from "@/utils/profileStatus";
import {
  profileSections,
  importConfirmMessage,
  staleImportNotice,
  importResultNotice,
  importErrorsNotice,
  exportResultNotice,
} from "@/utils/shopProfileView";
import styles from "./SettingsView.module.css";

// Settings -> Shop Profile (ETAP 3-4). The deployment-level configuration (PRODUCTIZATION: set by
// import, not edited here): a read-only view of what this station runs on, plus the profile file -
// Export and a two-phase Import (main previews, the operator confirms the diff, main applies).
const ShopProfileView = () => {
  const shopProfile = useStore((s) => s.shopProfile);
  const shopProfileStatus = useStore((s) => s.shopProfileStatus);
  const loadShopProfile = useStore((s) => s.loadShopProfile);
  const [busy, setBusy] = useState(null); // null | "export" | "import"
  const [importErrors, setImportErrors] = useState([]);

  const handleExport = async () => {
    setBusy("export");
    try {
      const res = await exportShopProfile();
      if (res?.canceled) return;
      notify(exportResultNotice(res));
    } catch (err) {
      notify({ type: "Error", title: "Export failed", message: err?.message || "Unknown error." });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    setImportErrors([]);
    try {
      const preview = await previewShopProfileImport();
      if (preview?.canceled) return;
      if (!preview?.success) {
        notify({ type: "Error", title: "Import failed", message: preview?.error || "Unknown error." });
        return;
      }
      if (!preview.valid) {
        setImportErrors(preview.errors ?? []);
        notify(importErrorsNotice(preview.errors));
        return;
      }
      if (preview.unchanged) {
        notify({ type: "Info", title: "Nothing to import", message: "The file holds the same profile as the database." });
        return;
      }
      if (preview.stationStale) {
        notify(staleImportNotice(preview));
        return;
      }
      if (!(await showConfirm(importConfirmMessage(preview)))) return;

      const res = await applyShopProfileImport(preview.token);
      // Main reloaded its cache whatever happened (the new profile, or the one that refused it);
      // loadShopProfile sets shopProfile + shopProfileStatus in ONE set() from that cache.
      await loadShopProfile();
      notify(importResultNotice(res));
    } catch (err) {
      // a timeout on apply: the write may or may not have landed - show what is there now
      await loadShopProfile();
      notify({ type: "Error", title: "Import failed", message: `${err?.message || "Unknown error."} The view now shows what the database holds.` });
    } finally {
      setBusy(null);
    }
  };

  const failed = shopProfileStatus === PROFILE_STATUS.FAILED;
  const sections = profileSections(shopProfile);

  return (
    <div className={`${styles.view} ${styles.view_wide}`}>
      <div className={styles.view_header}>
        <h2 className={styles.view_title}>Shop Profile</h2>
        <p className={styles.view_desc}>
          How this shop works - printers, material classes, product sizes, folders, scanner rules. Set by importing a
          profile file; shared by every station.
        </p>
      </div>
      <div className={styles.view_body}>
        {failed && <p className={styles.field_error}>The shop profile could not be read - the database may be unreachable.</p>}
        {importErrors.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>The file was not imported</label>
            {importErrors.map((e) => (
              <p key={e} className={styles.field_error}>
                {e}
              </p>
            ))}
          </div>
        )}
        {sections.map((section) => (
          <div key={section.title} className={styles.field}>
            <label className={styles.label}>{section.title}</label>
            {section.rows.length === 0 ? (
              <p className={styles.hint}>none</p>
            ) : (
              section.rows.map((row, i) => (
                <p key={i} className={styles.hint} style={{ color: "var(--text-primary)" }}>
                  {row}
                </p>
              ))
            )}
          </div>
        ))}
      </div>
      <div className={styles.view_footer} style={{ gap: 12 }}>
        <button className={styles.browse_btn} onClick={handleExport} disabled={busy !== null || failed}>
          <LuDownload size={15} />
          {busy === "export" ? "Exporting…" : "Export"}
        </button>
        <button className={styles.save_btn} onClick={handleImport} disabled={busy !== null || failed}>
          <LuUpload size={15} />
          {busy === "import" ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
};

export default ShopProfileView;
