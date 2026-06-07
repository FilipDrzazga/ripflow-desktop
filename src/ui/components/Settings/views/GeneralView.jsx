import { useState, useEffect } from "react";
import { getSettings, setSettings } from "../../../services/settingsService";
import { notify } from "@/utils/notify";
import { LuSave } from "react-icons/lu";
import styles from "./SettingsView.module.css";

const GeneralView = () => {
  const [allSettings, setAllSettings] = useState(null);
  const [workstationName, setWorkstationName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setAllSettings(res.settings);
        const name = res.settings.workstationName ?? "";
        setWorkstationName(name);
        setInitialName(name);
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await setSettings({ ...allSettings, workstationName });
      if (res.success) {
        setAllSettings((s) => ({ ...s, workstationName }));
        setInitialName(workstationName);
        notify({ type: "Success", title: "Settings saved", message: "Workstation name updated." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save settings." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const nameEmpty = workstationName.trim() === "";
  const isUnchanged = allSettings !== null && workstationName === initialName;

  return (
    <div className={styles.view}>
      <div className={styles.view_header}>
        <h2 className={styles.view_title}>General</h2>
        <p className={styles.view_desc}>Basic workstation identity used in shared logs.</p>
      </div>
      <div className={styles.view_body}>
        <div className={styles.field}>
          <label className={styles.label}>Workstation Name</label>
          <div className={styles.input_row}>
            <input
              className={`${styles.input} ${nameEmpty ? styles.input_error : ""}`}
              value={workstationName}
              onChange={(e) => setWorkstationName(e.target.value)}
              spellCheck={false}
            />
          </div>
          {nameEmpty
            ? <p className={styles.field_error}>Workstation name cannot be empty.</p>
            : <p className={styles.hint}>Identifies this machine in session logs shared across workstations.</p>
          }
        </div>
      </div>
      <div className={styles.view_footer}>
        <button className={styles.save_btn} onClick={handleSave} disabled={isSaving || !allSettings || nameEmpty || isUnchanged}>
          <LuSave size={15} />
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default GeneralView;
