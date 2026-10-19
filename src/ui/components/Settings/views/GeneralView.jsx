import { useState, useEffect } from "react";
import { getSettings, setSettings } from "../../../services/settingsService";
import { notify } from "@/utils/notify";
import { LuSave } from "react-icons/lu";
import Select from "../../Select/Select";
import styles from "./SettingsView.module.css";

const ROLE_OPTIONS = [
  { value: "",           label: "No role / default" },
  { value: "cotton",     label: "Cotton" },
  { value: "polyester",  label: "Polyester" },
  { value: "rollpress",  label: "Rollpress" },
  { value: "qc",         label: "QC" },
];

const GeneralView = () => {
  const [allSettings, setAllSettings] = useState(null);
  const [workstationName, setWorkstationName] = useState("");
  const [workstationRole, setWorkstationRole] = useState("");
  const [shippedRetentionDays, setShippedRetentionDays] = useState(30);
  const [batchHistoryEagerDays, setBatchHistoryEagerDays] = useState(7);
  const [clientId, setClientId] = useState("all");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setAllSettings(res.settings);
        setWorkstationName(res.settings.workstationName ?? "");
        setWorkstationRole(res.settings.workstationRole ?? "");
        setShippedRetentionDays(res.settings.shippedRetentionDays ?? 30);
        setBatchHistoryEagerDays(res.settings.batchHistoryEagerDays ?? 7);
        setClientId(res.settings.clientId ?? "all");
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await setSettings({ ...allSettings, workstationName, workstationRole, shippedRetentionDays, batchHistoryEagerDays, clientId });
      if (res.success) {
        setAllSettings((s) => ({ ...s, workstationName, workstationRole, shippedRetentionDays, batchHistoryEagerDays, clientId }));
        notify({ type: "Success", title: "Settings saved", message: "General settings updated." });
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
        <h2 className={styles.view_title}>General</h2>
        <p className={styles.view_desc}>Basic workstation identity used in shared logs.</p>
      </div>
      <div className={styles.view_body}>
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
          <p className={styles.hint}>Identifies this machine in session logs shared across workstations.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Workstation Role</label>
          <div className={styles.input_row}>
            <Select value={workstationRole} options={ROLE_OPTIONS} onChange={setWorkstationRole} ariaLabel="Workstation Role" />
          </div>
          <p className={styles.hint}>Controls scanner behaviour in the Production view on this PC.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Shipped file retention (days)</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              type="number"
              min="1"
              max="365"
              value={shippedRetentionDays}
              onChange={(e) => setShippedRetentionDays(Math.max(1, Math.floor(Number(e.target.value) || 30)))}
              style={{ maxWidth: 100 }}
            />
          </div>
          <p className={styles.hint}>Production stage records for shipped files are deleted after this many days on startup.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Batch history eager-load (days)</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              type="number"
              min="1"
              max="365"
              value={batchHistoryEagerDays}
              onChange={(e) => setBatchHistoryEagerDays(Math.max(1, Math.floor(Number(e.target.value) || 7)))}
              style={{ maxWidth: 100 }}
            />
          </div>
          <p className={styles.hint}>Batch history loads the most recent N days upfront; older days load on demand when expanded.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Client ID</label>
          <div className={styles.input_row}>
            <input
              className={styles.input}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              spellCheck={false}
            />
          </div>
          <p className={styles.hint}>Release channel for this installation. Filters the changelog in Updates; entries marked "all" always show.</p>
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

export default GeneralView;
