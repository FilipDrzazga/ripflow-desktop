import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LuCheck, LuCircleCheck, LuCircleX, LuFolderOpen, LuRefreshCw, LuRotateCcw, LuTriangleAlert, LuUpload } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { getSettings, setSettings, selectFolder } from "../../services/settingsService";
import { checkSetupFolders, relaunchApp } from "../../services/systemService";
import { useProfileImport } from "../../hooks/useProfileImport";
import { notify } from "@/utils/notify";
import { isPathSet } from "../../../shared/requiredPaths";
import { reloadResultNotice } from "@/utils/shopProfileView";
import {
  WIZARD_STEPS,
  profileStepState,
  canLeaveProfileStep,
  folderCheckRows,
  folderCheckSummary,
} from "@/utils/setupWizard";
import fields from "../Settings/views/SettingsView.module.css";
import styles from "./SetupWizard.module.css";

// First-run wizard (ETAP 4, 4-wizard) - opened by App.jsx at startup when the storage or XML path is
// blank, in place of the old "Paths not set" notice. What each step says is in utils/setupWizard.js.
// "Set up later" closes it and leaves the operator in Settings, as before the wizard.
const SetupWizard = ({ onClose, onPathsSaved }) => {
  const [step, setStep] = useState(0);
  const cardRef = useRef(null);

  useGSAP(() => {
    gsap.fromTo(cardRef.current, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" });
  });

  const stepKey = WIZARD_STEPS[step].key;

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={cardRef} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header className={styles.header}>
          <h2 id="setup-title" className={styles.title}>
            Set up this station
          </h2>
          <p className={styles.subtitle}>Three steps before RipFlow can print from this computer.</p>
          <ol className={styles.stepper}>
            {WIZARD_STEPS.map((s, i) => (
              <li
                key={s.key}
                className={`${styles.step} ${i === step ? styles.step_active : ""} ${i < step ? styles.step_done : ""}`}
              >
                <span className={styles.step_dot}>{i < step ? <LuCheck size={12} /> : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
        </header>
        <div className={styles.body}>
          {stepKey === "paths" && <PathsStep onSaved={onPathsSaved} onDone={() => setStep(1)} />}
          {stepKey === "profile" && <ProfileStep onBack={() => setStep(0)} onDone={() => setStep(2)} />}
          {stepKey === "folders" && <FoldersStep onBack={() => setStep(1)} />}
        </div>
        <footer className={styles.footer}>
          <button className={styles.later_btn} onClick={onClose}>
            Set up later
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

// Step 1 - the two required paths, saved like Settings > Paths (full settings first, rule 4); then the
// database is opened on the new storage path through "Reload shop data" (no restart needed for that).
const PathsStep = ({ onSaved, onDone }) => {
  const reloadShopData = useStore((s) => s.reloadShopData);
  const [allSettings, setAllSettings] = useState(null);
  const [storagePath, setStoragePath] = useState("");
  const [xmlPath, setXmlPath] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((res) => {
        // Without the settings the save cannot keep the other fields (rule 4) - say so, never
        // leave a silently disabled button.
        if (!res?.success) {
          setError(`${res?.error || "Could not read the settings."} Close the wizard and restart RipFlow.`);
          return;
        }
        setAllSettings(res.settings);
        setStoragePath(res.settings.storagePath ?? "");
        setXmlPath(res.settings.xmlPath ?? "");
      })
      .catch((err) => setError(err?.message || "Could not read the settings."));
  }, []);

  const browse = async (set) => {
    const res = await selectFolder();
    if (!res?.canceled && res?.path) set(res.path);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await setSettings({ ...allSettings, storagePath: storagePath.trim(), xmlPath: xmlPath.trim() });
      if (!res?.success) {
        setError(res?.error || "Could not save the paths.");
        return;
      }
      onSaved?.();
      const reload = await reloadShopData();
      if (!reload?.success || reload.dbOpen === false) notify(reloadResultNotice(reload));
      onDone();
    } catch (err) {
      setError(err?.message || "Could not save the paths.");
    } finally {
      setSaving(false);
    }
  };

  const ready = allSettings !== null && isPathSet(storagePath) && isPathSet(xmlPath);
  return (
    <>
      <PathField
        label="Storage path (INBOX)"
        hint="The shared folder with the print-ready files. The shop database (ripflow.db), PRINTED and the printer hotfolders live in it."
        value={storagePath}
        onChange={setStoragePath}
        onBrowse={() => browse(setStoragePath)}
      />
      <PathField
        label="XML path"
        hint="The same folder as PrintFactory sees it - written into every job file. On most stations it is the storage path again."
        value={xmlPath}
        onChange={setXmlPath}
        onBrowse={() => browse(setXmlPath)}
      />
      {error && <p className={fields.field_error}>{error}</p>}
      <div className={styles.actions}>
        <span />
        <button className={fields.save_btn} onClick={save} disabled={!ready || saving}>
          {saving ? "Saving…" : "Save and continue"}
        </button>
      </div>
    </>
  );
};

const PathField = ({ label, hint, value, onChange, onBrowse }) => (
  <div className={fields.field}>
    <label className={fields.label}>{label}</label>
    <div className={fields.input_row}>
      <input
        className={`${fields.input} ${isPathSet(value) ? "" : fields.input_error}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <button className={fields.browse_btn} onClick={onBrowse}>
        <LuFolderOpen size={15} />
        Browse
      </button>
    </div>
    <p className={fields.hint}>{hint}</p>
  </div>
);

// Step 2 - the shared profile row. Another station may have imported it already; an empty one is
// imported here, through the SAME import as Settings > Shop Profile (useProfileImport).
const ProfileStep = ({ onBack, onDone }) => {
  const shopProfile = useStore((s) => s.shopProfile);
  const shopProfileStatus = useStore((s) => s.shopProfileStatus);
  const reloadShopData = useStore((s) => s.reloadShopData);
  const { importing, importErrors, runImport } = useProfileImport();
  const [retrying, setRetrying] = useState(false);
  const state = profileStepState(shopProfileStatus, shopProfile);

  const retry = async () => {
    setRetrying(true);
    try {
      notify(reloadResultNotice(await reloadShopData()));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      {state === "loading" && <p className={styles.text}>Reading the shop profile…</p>}
      {state === "unreadable" && (
        <div className={styles.alert}>
          <LuTriangleAlert size={16} />
          <div>
            <strong>The shop database could not be opened.</strong> Check the storage path and that this computer can
            reach the server, then try again.
          </div>
        </div>
      )}
      {state === "empty" && (
        <p className={styles.text}>
          No shop profile yet - it says which printers, fabrics and folders this shop uses. Import the profile file you
          received with RipFlow. Every station shares it, so this is needed once per shop.
        </p>
      )}
      {state === "ready" && (
        <>
          <p className={styles.text}>The shop profile is already in the database - nothing to import on this station.</p>
          <div className={styles.printers}>
            {(shopProfile.printers ?? []).map((p, i) => (
              <span key={`${p?.code}-${i}`} className={styles.printer_chip}>
                <strong>{String(p?.code ?? "?")}</strong> {String(p?.materialClass ?? "")}
                <span className={styles.mono}>{String(p?.hotfolder ?? "")}</span>
              </span>
            ))}
          </div>
        </>
      )}
      {importErrors.length > 0 && (
        <div className={styles.alert}>
          <LuTriangleAlert size={16} />
          <ul>
            {importErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.actions}>
        <button className={fields.browse_btn} onClick={onBack}>
          Back
        </button>
        <div className={styles.actions_right}>
          {state === "unreadable" && (
            <button className={fields.browse_btn} onClick={retry} disabled={retrying}>
              <LuRefreshCw size={15} />
              {retrying ? "Retrying…" : "Try again"}
            </button>
          )}
          {state === "empty" && (
            <button className={fields.save_btn} onClick={runImport} disabled={importing}>
              <LuUpload size={15} />
              {importing ? "Importing…" : "Import profile file"}
            </button>
          )}
          {state === "ready" && (
            <button className={fields.save_btn} onClick={onDone} disabled={!canLeaveProfileStep(state)}>
              Continue
            </button>
          )}
        </div>
      </div>
    </>
  );
};

// Step 3 - can this station READ every folder it works with (setup:checkFolders: a real listing,
// nothing written). Then the restart: the watchers and polls take the paths only at startup.
const FoldersStep = ({ onBack }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await checkSetupFolders();
      if (res?.success) setRows(folderCheckRows(res.folders));
      else setError(res?.error || "The check failed.");
    } catch (err) {
      setError(err?.message || "The check failed.");
    } finally {
      setChecking(false);
    }
  };

  // The first check runs by itself. Started from the effect, it sets state only after an await.
  useEffect(() => {
    check();
  }, []);

  const restart = async () => {
    const res = await relaunchApp();
    if (res?.reason === "sandbox") {
      notify({ type: "Info", title: "Restart by hand", message: "Run from the repository: close RipFlow and start it again." });
    }
  };

  const summary = rows ? folderCheckSummary(rows) : null;
  return (
    <>
      {!rows && !error && <p className={styles.text}>Checking the folders…</p>}
      {error && <p className={fields.field_error}>{error}</p>}
      {rows && (
        <ul className={styles.folders}>
          {rows.map((r) => (
            // FILIP 2026-09-29 (ODP 41): the state is an icon; the cause is its tooltip, and its
            // aria-label for a screen reader / keyboard focus (tabIndex) - never mouse-only.
            <li key={`${r.label}-${r.path}`} className={`${styles.folder} ${r.ok ? "" : styles.folder_bad}`}>
              <span className={styles.folder_label}>{r.label}</span>
              <span className={styles.mono} title={r.path}>
                {r.path}
              </span>
              <span className={styles.folder_icon} title={r.message} aria-label={r.message} role="img" tabIndex={0}>
                {r.ok ? <LuCircleCheck size={20} /> : <LuCircleX size={20} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {summary && <p className={`${styles.summary} ${styles[`summary_${summary.tone}`]}`}>{summary.text}</p>}
      <div className={styles.actions}>
        <button className={fields.browse_btn} onClick={onBack}>
          Back
        </button>
        <div className={styles.actions_right}>
          <button className={fields.browse_btn} onClick={check} disabled={checking}>
            <LuRefreshCw size={15} />
            {checking ? "Checking…" : "Check again"}
          </button>
          <button className={fields.save_btn} onClick={restart}>
            <LuRotateCcw size={15} />
            Restart RipFlow
          </button>
        </div>
      </div>
    </>
  );
};

export default SetupWizard;
