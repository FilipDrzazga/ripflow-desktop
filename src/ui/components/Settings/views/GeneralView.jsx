import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getSettings, setSettings } from "../../../services/settingsService";
import { notify } from "@/utils/notify";
import { LuSave, LuChevronDown } from "react-icons/lu";
import styles from "./SettingsView.module.css";

const ROLE_OPTIONS = [
  { value: "",           label: "No role / default" },
  { value: "cotton",     label: "Cotton" },
  { value: "polyester",  label: "Polyester" },
  { value: "rollpress",  label: "Rollpress" },
  { value: "qc",         label: "QC" },
];

const RoleDropdown = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, minWidth: 0 });

  const selected = ROLE_OPTIONS.find((o) => o.value === value) ?? ROLE_OPTIONS[0];

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.input} ${styles.select_trigger}`}
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selected.label}</span>
        <LuChevronDown
          size={14}
          className={`${styles.select_chevron} ${isOpen ? styles.select_chevron_open : ""}`}
        />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.select_panel}
            style={{ top: panelPos.top, left: panelPos.left, minWidth: panelPos.minWidth }}
            role="listbox"
          >
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.select_option} ${opt.value === value ? styles.select_option_active : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                role="option"
                aria-selected={opt.value === value}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

const GeneralView = () => {
  const [allSettings, setAllSettings] = useState(null);
  const [workstationName, setWorkstationName] = useState("");
  const [workstationRole, setWorkstationRole] = useState("");
  const [shippedRetentionDays, setShippedRetentionDays] = useState(30);
  const [clientId, setClientId] = useState("all");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setAllSettings(res.settings);
        setWorkstationName(res.settings.workstationName ?? "");
        setWorkstationRole(res.settings.workstationRole ?? "");
        setShippedRetentionDays(res.settings.shippedRetentionDays ?? 30);
        setClientId(res.settings.clientId ?? "all");
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await setSettings({ ...allSettings, workstationName, workstationRole, shippedRetentionDays, clientId });
      if (res.success) {
        setAllSettings((s) => ({ ...s, workstationName, workstationRole, shippedRetentionDays, clientId }));
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
            <RoleDropdown value={workstationRole} onChange={setWorkstationRole} />
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
