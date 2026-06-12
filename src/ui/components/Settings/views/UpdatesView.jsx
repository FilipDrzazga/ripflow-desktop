import { useState, useEffect, useRef } from "react";
import { LuRefreshCw, LuDownload, LuTag } from "react-icons/lu";
import { getSettings } from "../../../services/settingsService";
import {
  checkForUpdate,
  installUpdate,
  onUpdateAvailable,
  onUpdateProgress,
  onUpdateReady,
  onUpdateNotAvailable,
  onUpdateError,
  getAppVersion,
} from "../../../services/updateService";
import sharedStyles from "./SettingsView.module.css";
import styles from "./UpdatesView.module.css";

const UpdatesView = () => {
  const [status, setStatus] = useState("idle");
  const [availableVersion, setAvailableVersion] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [changelog, setChangelog] = useState([]);
  const [clientId, setClientId] = useState("all");
  const [appVersion, setAppVersion] = useState(null);
  const checkTimeoutRef = useRef(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion);

    getSettings().then((res) => {
      if (res.success) {
        setClientId(res.settings.clientId ?? "all");
      }
    });

    fetch("./changelog.json")
      .then((r) => r.json())
      .then(setChangelog)
      .catch(() => {});

    const clearCheckTimeout = () => clearTimeout(checkTimeoutRef.current);

    const unsubAvailable = onUpdateAvailable((version) => {
      clearCheckTimeout();
      setAvailableVersion(version);
      setStatus("available");
    });
    const unsubProgress = onUpdateProgress((percent) => {
      clearCheckTimeout();
      setProgress(percent);
      setStatus("downloading");
    });
    const unsubReady = onUpdateReady(() => { clearCheckTimeout(); setStatus("ready"); });
    const unsubNotAvailable = onUpdateNotAvailable(() => { clearCheckTimeout(); setStatus("uptodate"); });
    const unsubError = onUpdateError((msg) => {
      clearCheckTimeout();
      setErrorMsg(msg);
      setStatus("error");
    });

    return () => {
      clearCheckTimeout();
      unsubAvailable();
      unsubProgress();
      unsubReady();
      unsubNotAvailable();
      unsubError();
    };
  }, []);

  const handleCheck = async () => {
    setStatus("checking");
    setErrorMsg(null);
    clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(() => {
      setErrorMsg("Update check timed out. Check your internet connection.");
      setStatus("error");
    }, 14000);
    try {
      await checkForUpdate();
    } catch (err) {
      clearTimeout(checkTimeoutRef.current);
      setErrorMsg(err?.message ?? "Update check failed.");
      setStatus("error");
    }
  };

  const isDisabled = status === "checking" || status === "downloading";

  const visibleChangelog = changelog
    .map((entry) => ({
      ...entry,
      changes: entry.changes.filter(
        (c) => c.clients.includes("all") || c.clients.includes(clientId)
      ),
    }))
    .filter((entry) => entry.changes.length > 0);

  return (
    <div className={`${sharedStyles.view} ${sharedStyles.view_wide}`}>
      <div className={sharedStyles.view_header}>
        <h2 className={sharedStyles.view_title}>Updates</h2>
        <p className={sharedStyles.view_desc}>Manage application updates and view release notes.</p>
      </div>
      <div className={sharedStyles.view_body}>
        <div className={sharedStyles.field}>
          <div className={styles.label_row}>
            <span className={sharedStyles.label}>Current Version:</span>
            {appVersion && (
              <span className={styles.version_badge}>
                <LuTag size={11} />
                {appVersion}
              </span>
            )}
            <button className={`${styles.check_btn} ${styles.check_btn_right}`} onClick={handleCheck} disabled={isDisabled}>
              {isDisabled ? <span className={styles.spinner} /> : <LuRefreshCw size={14} />}
              Check for updates
            </button>
          </div>
          <div className={styles.status_area}>
            {status === "checking" && (
              <p className={`${styles.status_text} ${styles.status_checking}`}>
                Checking for updates…
              </p>
            )}
            {status === "uptodate" && (
              <p className={`${styles.status_text} ${styles.status_uptodate}`}>
                You're up to date.
              </p>
            )}
            {status === "available" && (
              <p className={`${styles.status_text} ${styles.status_available}`}>
                Version {availableVersion} is available. Downloading…
              </p>
            )}
            {status === "downloading" && (
              <>
                <p className={`${styles.status_text} ${styles.status_downloading}`}>
                  Downloading… {progress}%
                </p>
                <div className={styles.progress_bar_track}>
                  <div className={styles.progress_bar_fill} style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
            {status === "ready" && (
              <>
                <p className={`${styles.status_text} ${styles.status_ready}`}>
                  Update ready to install.
                </p>
                <button className={styles.install_btn} onClick={installUpdate}>
                  <LuDownload size={14} />
                  Install &amp; Restart
                </button>
              </>
            )}
            {status === "error" && (
              <p className={`${styles.status_text} ${styles.status_error}`}>
                Error: {errorMsg}
              </p>
            )}
          </div>
        </div>

        {visibleChangelog.length > 0 && (
          <div className={sharedStyles.field}>
            <span className={sharedStyles.label}>Changelog:</span>
            <div className={styles.changelog_section}>
              {visibleChangelog.map((entry) => (
                <div key={entry.version} className={styles.changelog_entry}>
                  <div className={styles.changelog_version}>
                    <span className={styles.changelog_version_num}>v{entry.version}</span>
                    <span className={styles.changelog_date}>{entry.date}</span>
                  </div>
                  <ul className={styles.changelog_list}>
                    {entry.changes.map((c, i) => (
                      <li key={i}>{c.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdatesView;
