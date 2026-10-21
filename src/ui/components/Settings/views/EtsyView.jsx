import { useState, useEffect } from "react";
import { LuSave, LuLink, LuPlugZap, LuUnlink, LuTrash2 } from "react-icons/lu";
import { getEtsyStatus, saveEtsyKey, connectEtsy, testEtsyConnection, disconnectEtsy, removeEtsyKey } from "../../../services/etsyService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import { etsyStatusLine, etsyResultNotice, etsyTestRows } from "@/utils/etsyView";
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

  const take = (res) => {
    if (res && "status" in res) setStatus(res.status);
    if (res?.redirectUri) setRedirectUri(res.redirectUri);
  };

  useEffect(() => {
    getEtsyStatus()
      .then(take)
      .catch(() => setStatus(null))
      .finally(() => setLoaded(true));
  }, []);

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
      </div>
    </div>
  );
};

export default EtsyView;
