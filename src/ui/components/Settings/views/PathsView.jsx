import { useState, useEffect } from "react";
import { getSettings, setSettings, selectFolder } from "../../../services/settingsService";
import { notify } from "@/utils/notify";
import { LuFolderOpen, LuSave } from "react-icons/lu";
import styles from "./SettingsView.module.css";

const PathsView = () => {
  const [allSettings, setAllSettings] = useState(null);
  const [storagePath, setStoragePath] = useState("");
  const [xmlPath, setXmlPath] = useState("");
  const [customOrderFolderPath, setCustomOrderFolderPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setAllSettings(res.settings);
        setStoragePath(res.settings.storagePath ?? "");
        setXmlPath(res.settings.xmlPath ?? "");
        setCustomOrderFolderPath(res.settings.customOrderFolderPath ?? "");
      }
    });
  }, []);

  const handleBrowse = async (field) => {
    const res = await selectFolder();
    if (!res.canceled && res.path) {
      if (field === "storagePath") setStoragePath(res.path);
      else if (field === "xmlPath") setXmlPath(res.path);
      else if (field === "customOrderFolderPath") setCustomOrderFolderPath(res.path);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await setSettings({ ...allSettings, storagePath, xmlPath, customOrderFolderPath });
      if (res.success) {
        setAllSettings((s) => ({ ...s, storagePath, xmlPath, customOrderFolderPath }));
        notify({ type: "Success", title: "Settings saved", message: "Paths updated successfully." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save settings." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.view}>
      <div className={styles.view_header}>
        <h2 className={styles.view_title}>Paths</h2>
        <p className={styles.view_desc}>Network and local folder paths used by the workflow.</p>
      </div>
      <div className={styles.view_body}>
        <div className={styles.field}>
          <label className={styles.label}>Storage Path (INBOX)</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              value={storagePath}
              onChange={(e) => setStoragePath(e.target.value)}
              spellCheck={false}
            />
            <button className={styles.browse_btn} onClick={() => handleBrowse("storagePath")}>
              <LuFolderOpen size={15} />
              Browse
            </button>
          </div>
          <p className={styles.hint}>Root folder scanned for print-ready artwork files.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>XML Workflow Path</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              value={xmlPath}
              onChange={(e) => setXmlPath(e.target.value)}
              spellCheck={false}
            />
            <button className={styles.browse_btn} onClick={() => handleBrowse("xmlPath")}>
              <LuFolderOpen size={15} />
              Browse
            </button>
          </div>
          <p className={styles.hint}>Network path where PrintFactory XML files are written.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Order Folder</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              value={customOrderFolderPath}
              onChange={(e) => setCustomOrderFolderPath(e.target.value)}
              spellCheck={false}
              placeholder="Leave empty to disable"
            />
            <button className={styles.browse_btn} onClick={() => handleBrowse("customOrderFolderPath")}>
              <LuFolderOpen size={15} />
              Browse
            </button>
          </div>
          <p className={styles.hint}>Flat folder containing .tif files matched against Custom Order CSVs.</p>
        </div>
      </div>
      <div className={styles.view_footer}>
        <button className={styles.save_btn} onClick={handleSave} disabled={isSaving || !allSettings}>
          <LuSave size={15} />
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default PathsView;
