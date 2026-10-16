import { useState, useEffect } from "react";
import { LuSave, LuPlugZap, LuTrash2 } from "react-icons/lu";
import { hasCloudKey, setCloudKey, clearCloudKey, testCloudKey } from "../../../services/cloudService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import styles from "./SettingsView.module.css";

// The PrintFactory Cloud key (MisKey) of this station, a section of General (it is per PC like the
// rest of that view; a section of its own would change the Settings sidebar). Not part of the
// General form: it has its own Save, Test and Remove.
// The key is stored encrypted by Windows for this PC and Windows user only, and is never shown
// again: the field is for typing a new one.
const CloudKeySection = () => {
  const [configured, setConfigured] = useState(null); // null = not read yet
  const [keyInput, setKeyInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    hasCloudKey()
      .then((res) => setConfigured(res?.success ? Boolean(res.data?.configured) : false))
      .catch(() => setConfigured(false));
  }, []);

  const reportFailure = (title, res, fallback) =>
    notify({ type: "Error", title, message: res?.error?.message || fallback });

  const handleSave = async () => {
    setIsBusy(true);
    try {
      const res = await setCloudKey(keyInput);
      if (res?.success) {
        setKeyInput("");
        setConfigured(true);
        notify({ type: "Success", title: "Key saved", message: "The PrintFactory Cloud key is stored on this PC. The Printed metres tile reads it within five minutes." });
      } else {
        reportFailure("Key not saved", res, "Could not save the key.");
      }
    } catch (err) {
      notify({ type: "Error", title: "Key not saved", message: err.message });
    } finally {
      setIsBusy(false);
    }
  };

  // Tests what is typed, or the stored key when the field is empty.
  const handleTest = async () => {
    setIsBusy(true);
    try {
      const res = await testCloudKey(keyInput);
      if (res?.success) {
        notify({ type: "Success", title: "PrintFactory Cloud", message: "The Cloud answered and accepted the key." });
      } else {
        reportFailure("PrintFactory Cloud test failed", res, "The test failed.");
      }
    } catch (err) {
      notify({ type: "Error", title: "PrintFactory Cloud test failed", message: err.message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await showConfirm("Remove the PrintFactory Cloud key from this PC? The Printed metres tile stops reading the Cloud.");
    if (!confirmed) return;
    setIsBusy(true);
    try {
      const res = await clearCloudKey();
      if (res?.success) {
        setConfigured(false);
        notify({ type: "Success", title: "Key removed", message: "The PrintFactory Cloud key was removed from this PC." });
      } else {
        reportFailure("Key not removed", res, "Could not remove the key.");
      }
    } catch (err) {
      notify({ type: "Error", title: "Key not removed", message: err.message });
    } finally {
      setIsBusy(false);
    }
  };

  const hasTyped = keyInput.trim() !== "";

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>PrintFactory Cloud key (MisKey)</label>
        <div className={styles.input_row}>
          <input
            className={styles.input}
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={configured ? "A key is stored on this PC - type a new one to replace it" : "Paste the key"}
            autoComplete="off"
            spellCheck={false}
          />
          <button className={styles.browse_btn} onClick={handleSave} disabled={isBusy || !hasTyped}>
            <LuSave size={15} />
            Save key
          </button>
          <button className={styles.browse_btn} onClick={handleTest} disabled={isBusy || (!hasTyped && !configured)}>
            <LuPlugZap size={15} />
            Test
          </button>
        </div>
        <p className={styles.hint}>
          {configured === null
            ? "Checking this PC..."
            : configured
              ? "A key is stored on this PC, encrypted by Windows (readable only by this Windows user). It feeds the Printed metres tile on the Print overview, read-only."
              : "No key on this PC. Create one in PrintFactory Cloud under Settings, External API; it feeds the Printed metres tile on the Print overview, read-only."}
        </p>
        {configured && (
          <div className={styles.input_row}>
            <button className={styles.danger_btn} onClick={handleRemove} disabled={isBusy}>
              <LuTrash2 size={15} />
              Remove key from this PC
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default CloudKeySection;
