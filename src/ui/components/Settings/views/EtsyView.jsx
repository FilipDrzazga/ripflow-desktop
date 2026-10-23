import { useState, useEffect } from "react";
import { LuSave, LuLink, LuPlugZap, LuUnlink, LuTrash2, LuFolderOpen, LuScanSearch, LuDownload } from "react-icons/lu";
import { previewNewestEtsyOrder, importEtsyOrder } from "../../../services/etsyImportService";
import { getEtsyStatus, saveEtsyKey, connectEtsy, testEtsyConnection, disconnectEtsy, removeEtsyKey } from "../../../services/etsyService";
import { getSettings, setSettings, selectFolder } from "../../../services/settingsService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import { etsyStatusLine, etsyResultNotice, etsyTestRows, previewOrderNotes, previewBuyerNote, previewLineView, previewDate, importOrderConfirm, importOrderNotice, etsyPaceLine } from "@/utils/etsyView";
import { clampEtsyImportMinutes, ETSY_IMPORT_MIN_MINUTES, ETSY_IMPORT_MAX_MINUTES } from "../../../../shared/etsyImportInterval";
import EtsyListingChoices from "./EtsyListingChoices";
import sharedStyles from "./SettingsView.module.css";
import styles from "./EtsyView.module.css";

// Settings -> Etsy (plan E2): THIS station's connection to the Etsy shop - the app key from
// etsy.com/developers/your-apps, the sign-in and a test that shows what an order carries.
// Main keeps every secret; the view only ever sees the public status.
const EtsyView = () => {
  const [status, setStatus] = useState(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [keystring, setKeystring] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [busy, setBusy] = useState(null);
  const [test, setTest] = useState(null);
  const [check, setCheck] = useState(null); // the answer of "Check newest order"
  const buyerNote = previewBuyerNote(check);
  // The order import of THIS station (E3b-2): per-machine settings, not part of the Etsy connection above.
  const [allSettings, setAllSettings] = useState(null);
  const [importEnabled, setImportEnabled] = useState(false);
  const [libraryPath, setLibraryPath] = useState("");
  // The field holds what is typed; the minutes are its clamped value (on blur the field shows them).
  const [intervalText, setIntervalText] = useState(String(clampEtsyImportMinutes(undefined)));
  const intervalMin = clampEtsyImportMinutes(intervalText);
  const [limits, setLimits] = useState(null); // Etsy's request allowance from its last answer to this station
  const [savedImport, setSavedImport] = useState(null);
  const [savingImport, setSavingImport] = useState(false);

  const take = (res) => {
    if (res && "status" in res) setStatus(res.status);
    if (res?.redirectUri) setRedirectUri(res.redirectUri);
    if (res && "limits" in res) setLimits(res.limits);
  };

  useEffect(() => {
    getEtsyStatus()
      .then(take)
      .catch(() => setStatus(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    getSettings()
      .then((res) => {
        if (!res.success) return;
        setAllSettings(res.settings);
        setImportEnabled(res.settings.etsyImportEnabled === true);
        setLibraryPath(res.settings.etsyLibraryPath ?? "");
        setIntervalText(String(clampEtsyImportMinutes(res.settings.etsyImportIntervalMin)));
        setSavedImport({ enabled: res.settings.etsyImportEnabled === true, path: res.settings.etsyLibraryPath ?? "", minutes: clampEtsyImportMinutes(res.settings.etsyImportIntervalMin) });
      })
      .catch(() => setAllSettings(null));
  }, []);

  const handleBrowseLibrary = async () => {
    const res = await selectFolder();
    if (!res.canceled && res.path) setLibraryPath(res.path);
  };

  const handleSaveImport = async () => {
    setSavingImport(true);
    try {
      const res = await setSettings({ ...allSettings, etsyImportEnabled: importEnabled, etsyLibraryPath: libraryPath.trim(), etsyImportIntervalMin: intervalMin });
      if (res.success) {
        setAllSettings((s) => ({ ...s, etsyImportEnabled: importEnabled, etsyLibraryPath: libraryPath.trim(), etsyImportIntervalMin: intervalMin }));
        setSavedImport({ enabled: importEnabled, path: libraryPath.trim(), minutes: intervalMin });
        notify({ type: "Success", title: "Etsy import", message: importEnabled ? "This station imports Etsy orders from now on." : "Etsy import is off on this station." });
      } else {
        notify({ type: "Error", title: "Etsy import not saved", message: res.error || "Could not save settings." });
      }
    } finally {
      setSavingImport(false);
    }
  };

  const run = async (name, call, notice) => {
    setBusy(name);
    try {
      const res = await call();
      take(res);
      notify(etsyResultNotice(res, notice));
      return res;
    } catch (err) {
      notify({ type: "Error", title: `${notice.title} failed`, message: err.message });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleSaveKey = async () => {
    const res = await run("save", () => saveEtsyKey(keystring.trim(), sharedSecret.trim()), {
      title: "Etsy key",
      success: "Key saved (encrypted on this PC). Press Connect to sign in.",
    });
    if (res?.success) {
      setKeystring("");
      setSharedSecret("");
      setTest(null);
    }
  };

  const handleConnect = () =>
    run("connect", connectEtsy, { title: "Connect to Etsy", success: "This station is connected to the Etsy shop." });

  const handleTest = async () => {
    setTest(null);
    const res = await run("test", testEtsyConnection, { title: "Etsy connection test", success: "Etsy answered." });
    if (res?.success) setTest(res.test);
  };

  // A dry run: main reads the newest paid order and says what the import WOULD do. Nothing is written or copied.
  const handleCheck = async () => {
    setCheck(null);
    const res = await run("check", previewNewestEtsyOrder, { title: "Check newest order", success: "Checked - nothing was imported." });
    if (res?.success) setCheck(res);
  };

  // "Import this order" (E5): only the number goes to main, which fetches the order from Etsy again and runs the
  // importer's own path. Only the importer station does it; any other one gets the reason back.
  const handleImportOrder = async (receiptId) => {
    if (!(await showConfirm(importOrderConfirm(receiptId)))) return;
    setBusy("import");
    try {
      notify(importOrderNotice(await importEtsyOrder(receiptId), receiptId));
    } catch (err) {
      notify({ type: "Error", title: "Etsy order import failed", message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!(await showConfirm("Disconnect this station from Etsy? The key stays; Connect signs in again."))) return;
    setTest(null);
    run("disconnect", disconnectEtsy, { title: "Disconnect Etsy", success: "Disconnected. The key is still saved." });
  };

  const handleRemoveKey = async () => {
    if (!(await showConfirm("Remove the Etsy key and the sign-in from this station?"))) return;
    setTest(null);
    run("remove", removeEtsyKey, { title: "Remove Etsy key", success: "Etsy key and sign-in removed from this station." });
  };

  const line = loaded ? etsyStatusLine(status) : { tone: "off", text: "Reading the Etsy connection..." };
  const canStore = !!status?.encryption;
  const isBusy = busy !== null;
  const importChanged =
    savedImport !== null && (savedImport.enabled !== importEnabled || savedImport.path !== libraryPath.trim() || savedImport.minutes !== intervalMin);
  const importNeedsFolder = importEnabled && libraryPath.trim() === "";

  return (
    <div className={sharedStyles.view}>
      <div className={sharedStyles.view_header}>
        <h2 className={sharedStyles.view_title}>Etsy</h2>
        <p className={sharedStyles.view_desc}>
          This station&apos;s connection to the Etsy shop. The key and the sign-in stay on this PC, encrypted for this Windows user.
        </p>
      </div>
      <div className={sharedStyles.view_body}>
        <div className={`${styles.status} ${styles[`status_${line.tone}`]}`} role="status">
          {line.text}
        </div>

        <div className={sharedStyles.field}>
          <label className={sharedStyles.label} htmlFor="etsy-keystring">
            Keystring
          </label>
          <div className={sharedStyles.input_row}>
            <input
              id="etsy-keystring"
              className={sharedStyles.input}
              value={keystring}
              onChange={(e) => setKeystring(e.target.value)}
              placeholder={status?.keyHint ? `Saved: ${status.keyHint}` : "From etsy.com/developers/your-apps"}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
        <div className={sharedStyles.field}>
          <label className={sharedStyles.label} htmlFor="etsy-secret">
            Shared secret
          </label>
          <div className={sharedStyles.input_row}>
            <input
              id="etsy-secret"
              className={sharedStyles.input}
              type="password"
              value={sharedSecret}
              onChange={(e) => setSharedSecret(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className={sharedStyles.browse_btn}
              onClick={handleSaveKey}
              disabled={isBusy || !canStore || !keystring.trim() || !sharedSecret.trim()}
            >
              <LuSave size={14} />
              {busy === "save" ? "Saving..." : "Save key"}
            </button>
          </div>
          <p className={sharedStyles.hint}>A new key replaces the old one and ends the current sign-in.</p>
        </div>

        <div className={sharedStyles.field}>
          <label className={sharedStyles.label} htmlFor="etsy-callback">
            Callback URL
          </label>
          <div className={sharedStyles.input_row}>
            <input id="etsy-callback" className={sharedStyles.input} value={redirectUri} readOnly spellCheck={false} />
          </div>
          <p className={sharedStyles.hint}>
            Add this address under &quot;Callback URLs&quot; of the app on Etsy. RipFlow catches it inside the sign-in window - nothing runs there.
          </p>
        </div>

        <div className={styles.buttons}>
          <button className={sharedStyles.browse_btn} onClick={handleConnect} disabled={isBusy || !status?.hasKey}>
            <LuLink size={14} />
            {busy === "connect" ? "Waiting for Etsy..." : status?.connected ? "Connect again" : "Connect"}
          </button>
          <button className={sharedStyles.browse_btn} onClick={handleTest} disabled={isBusy || !status?.connected}>
            <LuPlugZap size={14} />
            {busy === "test" ? "Testing..." : "Test connection"}
          </button>
          <button className={sharedStyles.browse_btn} onClick={handleDisconnect} disabled={isBusy || !status?.connected}>
            <LuUnlink size={14} />
            Disconnect
          </button>
          <button
            className={sharedStyles.browse_btn}
            onClick={handleCheck}
            disabled={isBusy || !status?.connected}
            title="Shows what the import would do with the newest paid order - nothing is imported"
          >
            <LuScanSearch size={14} />
            {busy === "check" ? "Checking..." : "Check newest order"}
          </button>
          <button className={sharedStyles.danger_btn} onClick={handleRemoveKey} disabled={isBusy || !status?.hasKey}>
            <LuTrash2 size={14} />
            Remove key
          </button>
        </div>

        {test && (
          <dl className={styles.test_rows}>
            {etsyTestRows(test).map((row) => (
              <div key={row.label} style={{ display: "contents" }}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {check && (
          <div className={styles.check} role="region" aria-label="What the import would do with the newest order">
            <div className={styles.check_title}>
              Newest paid order{check.receipt ? ` ET${check.receipt.receiptId}${check.receipt.created ? `, ${previewDate(check.receipt.created)}` : ""}` : ""} - dry run, nothing was imported
            </div>
            {previewOrderNotes(check).map((note) => (
              <div key={note.text} className={`${styles.check_note} ${styles[`check_note_${note.tone}`]}`}>
                {note.text}
              </div>
            ))}
            {buyerNote && (
              <div className={styles.check_buyer_note}>
                <div className={styles.check_buyer_note_label}>Buyer's note</div>
                <div className={styles.check_buyer_note_text}>{buyerNote}</div>
              </div>
            )}
            {check.lines.map((line) => {
              const view = previewLineView(line);
              return (
                <div key={line.transactionId} className={`${styles.check_line} ${view.ok ? styles.check_line_ok : styles.check_line_stop}`}>
                  <div className={styles.check_line_head}>{view.headline}</div>
                  <dl className={styles.check_rows}>
                    {view.rows.map((row) => (
                      <div key={row.label} style={{ display: "contents" }}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
            {check.receipt?.receiptId && (
              <div className={styles.buttons}>
                <button
                  className={sharedStyles.browse_btn}
                  onClick={() => handleImportOrder(check.receipt.receiptId)}
                  disabled={isBusy}
                  title="Imports this one order now, on the station that is switched On - the import start date does not change"
                >
                  <LuDownload size={14} />
                  {busy === "import" ? "Importing..." : "Import this order"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className={sharedStyles.field}>
          <span className={sharedStyles.label}>Import orders on this station</span>
          <div className={sharedStyles.toggle_row} role="group" aria-label="Import Etsy orders on this station">
            <button
              type="button"
              className={`${sharedStyles.toggle_btn} ${!importEnabled ? sharedStyles.toggle_btn_active : ""}`}
              aria-pressed={!importEnabled}
              onClick={() => setImportEnabled(false)}
              disabled={allSettings === null}
            >
              Off
            </button>
            <button
              type="button"
              className={`${sharedStyles.toggle_btn} ${importEnabled ? sharedStyles.toggle_btn_active : ""}`}
              aria-pressed={importEnabled}
              onClick={() => setImportEnabled(true)}
              disabled={allSettings === null}
            >
              On
            </button>
          </div>
          <p className={sharedStyles.hint}>
            Only ONE station should be On. It checks Etsy every {intervalMin} minutes and puts a file for each paid, unshipped order line into the inbox. It also needs the Etsy
            feature turned on in the shop profile. Turning it Off forgets the moment it was turned On: orders that arrive while it is Off are never imported
            later.
          </p>
        </div>
        <div className={sharedStyles.field}>
          <label className={sharedStyles.label} htmlFor="etsy-library">
            Etsy pattern folder
          </label>
          <div className={sharedStyles.input_row}>
            <input
              id="etsy-library"
              className={`${sharedStyles.input} ${importNeedsFolder ? sharedStyles.input_error : ""}`}
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
              placeholder="The folder with the Etsy pattern images (XWD...)"
              spellCheck={false}
            />
            <button className={sharedStyles.browse_btn} onClick={handleBrowseLibrary} disabled={allSettings === null}>
              <LuFolderOpen size={14} />
              Browse
            </button>
          </div>
          {importNeedsFolder && <p className={sharedStyles.field_error}>Choose the pattern folder before turning the import On.</p>}
          <p className={sharedStyles.hint}>Patterns are only copied from here, never moved. Each order line needs exactly one image with its XWD number in the name.</p>
        </div>
        <div className={sharedStyles.field}>
          <label className={sharedStyles.label} htmlFor="etsy-interval">
            Check Etsy every (minutes)
          </label>
          <div className={sharedStyles.input_row}>
            <input
              id="etsy-interval"
              className={sharedStyles.input}
              type="number"
              min={ETSY_IMPORT_MIN_MINUTES}
              max={ETSY_IMPORT_MAX_MINUTES}
              value={intervalText}
              onChange={(e) => setIntervalText(e.target.value)}
              onBlur={() => setIntervalText(String(intervalMin))}
              disabled={allSettings === null}
              style={{ maxWidth: 100 }}
            />
          </div>
          <p className={sharedStyles.hint}>
            {ETSY_IMPORT_MIN_MINUTES} to {ETSY_IMPORT_MAX_MINUTES} minutes, on the importer station; the new pace starts after its next check. {etsyPaceLine(intervalMin, limits)}
          </p>
        </div>
        <EtsyListingChoices />
      </div>
      {/* The footer Save is the one for every import option above (On/Off, the folder, the interval), like General and Paths: leaving the tab drops what is not saved. */}
      <div className={sharedStyles.view_footer}>
        {importChanged && <span className={styles.unsaved}>Not saved yet - press Save import settings</span>}
        <button className={sharedStyles.save_btn} onClick={handleSaveImport} disabled={savingImport || !importChanged || importNeedsFolder}>
          <LuSave size={14} />
          {savingImport ? "Saving..." : "Save import settings"}
        </button>
      </div>
    </div>
  );
};

export default EtsyView;
