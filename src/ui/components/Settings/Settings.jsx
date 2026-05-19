import { useState, useEffect } from "react";
import { notify } from "@/utils/notify";
import { LuFolderOpen, LuSave } from "react-icons/lu";
import styles from "./Settings.module.css";

const Settings = () => {
  const [storagePath, setStoragePath] = useState("");
  const [xmlPath, setXmlPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [workstationName, setWorkstationName] = useState("");
  const [isSavingWorkstation, setIsSavingWorkstation] = useState(false);
  const [customOrderFolderPath, setCustomOrderFolderPath] = useState("");
  const [isSavingCustomOrder, setIsSavingCustomOrder] = useState(false);

  useEffect(() => {
    window.api.getSettings().then((res) => {
      if (res.success) {
        setStoragePath(res.settings.storagePath);
        setXmlPath(res.settings.xmlPath);
        setWorkstationName(res.settings.workstationName ?? "");
        setCustomOrderFolderPath(res.settings.customOrderFolderPath ?? "");
      }
    });
  }, []);

  const handleBrowse = async (field) => {
    const res = await window.api.selectFolder();
    if (!res.canceled && res.path) {
      if (field === "storagePath") setStoragePath(res.path);
      else if (field === "xmlPath") setXmlPath(res.path);
      else if (field === "customOrderFolderPath") setCustomOrderFolderPath(res.path);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await window.api.setSettings({ storagePath, xmlPath });
      if (res.success) {
        notify({ type: "Success", title: "Settings saved", message: "Storage paths updated successfully." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save settings." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWorkstation = async () => {
    setIsSavingWorkstation(true);
    try {
      const res = await window.api.setSettings({ storagePath, xmlPath, workstationName });
      if (res.success) {
        notify({ type: "Success", title: "Workstation saved", message: "Workstation name updated successfully." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save workstation name." });
      }
    } finally {
      setIsSavingWorkstation(false);
    }
  };

  const handleSaveCustomOrder = async () => {
    setIsSavingCustomOrder(true);
    try {
      const res = await window.api.setSettings({
        storagePath,
        xmlPath,
        workstationName,
        customOrderFolderPath,
      });
      if (res.success) {
        notify({ type: "Success", title: "Settings saved", message: "Custom Order folder path updated successfully." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save settings." });
      }
    } finally {
      setIsSavingCustomOrder(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.card_header}>
          <h2 className={styles.title}>Storage Paths</h2>
        </div>
        <div className={styles.card_body}>
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
        </div>
        <div className={styles.card_footer}>
          <button className={styles.save_btn} onClick={handleSave} disabled={isSaving}>
            <LuSave size={15} />
            {isSaving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.card_header}>
          <h2 className={styles.title}>Workstation</h2>
        </div>
        <div className={styles.card_body}>
          <div className={styles.field}>
            <label className={styles.label}>Workstation Name</label>
            <div className={styles.input_row}>
              <input
                className={styles.input}
                value={workstationName}
                onChange={(e) => setWorkstationName(e.target.value)}
                spellCheck={false}
              />
            </div>
            <p className={styles.hint}>Identifies this computer in shared logs.</p>
          </div>
        </div>
        <div className={styles.card_footer}>
          <button className={styles.save_btn} onClick={handleSaveWorkstation} disabled={isSavingWorkstation}>
            <LuSave size={15} />
            {isSavingWorkstation ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.card_header}>
          <h2 className={styles.title}>Custom Orders</h2>
        </div>
        <div className={styles.card_body}>
          <div className={styles.field}>
            <label className={styles.label}>Custom Order Folder Path</label>
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
            <p className={styles.hint}>
              Flat folder containing .tif files matched against Custom Order CSVs (1400+ files).
            </p>
          </div>
        </div>
        <div className={styles.card_footer}>
          <button className={styles.save_btn} onClick={handleSaveCustomOrder} disabled={isSavingCustomOrder}>
            <LuSave size={15} />
            {isSavingCustomOrder ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
