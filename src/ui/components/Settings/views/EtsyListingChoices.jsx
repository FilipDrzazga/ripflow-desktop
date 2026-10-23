import { useCallback, useEffect, useRef, useState } from "react";
import { LuTag, LuX } from "react-icons/lu";
import { listEtsyListingChoices, forgetEtsyListingFabric, forgetEtsyListingPrintType, openEtsyListing } from "../../../services/etsyImportService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import { listingNotice } from "@/utils/etsyImportBar";
import { FORGET_KIND, choiceRows, choiceTitle, choicesLoadError, forgetConfirmMessage, forgetNotice, printTypeLabel } from "@/utils/etsyListingChoices";
import sharedStyles from "./SettingsView.module.css";
import styles from "./EtsyListingChoices.module.css";

// Settings > Etsy: the fabric and the product type a person chose in the Inbox bar for an Etsy LISTING (a snood, an
// apron), shared by every station. The importer uses a remembered fabric where the order line has no usable "Fabric"
// variation, and a remembered product type as the type of the listing's lines. Here a choice is only READ and FORGOTTEN -
// choosing happens in the bar, where the line that needs it is.
const EtsyListingChoices = () => {
  const [rows, setRows] = useState(null); // null = not read yet, or could not be read
  const [loadError, setLoadError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await listEtsyListingChoices();
      if (!aliveRef.current) return;
      const next = choiceRows(res);
      if (next) {
        setRows(next);
        setLoadError(null);
      } else {
        setLoadError(choicesLoadError(res).message);
      }
    } catch (err) {
      if (aliveRef.current) setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleForget = async (row, kind) => {
    if (!(await showConfirm(forgetConfirmMessage(row, kind)))) return;
    const key = `${row.listingId}:${kind}`;
    setBusyKey(key);
    try {
      const forget = kind === FORGET_KIND.FABRIC ? forgetEtsyListingFabric : forgetEtsyListingPrintType;
      const res = await forget(row.listingId);
      notify(forgetNotice(res, row, kind), { stage: "etsy-import", code: res?.success ? "ETSY_CHOICE_FORGOTTEN" : "ETSY_CHOICE_FORGET_FAILED" });
    } catch (err) {
      notify({ type: "Error", title: "Forgetting the Etsy choice failed", message: err.message }, { stage: "etsy-import", code: "ETSY_CHOICE_FORGET_FAILED" });
    } finally {
      if (aliveRef.current) setBusyKey(null);
      await load();
    }
  };

  const handleListing = async (row) => {
    try {
      const notice = listingNotice(await openEtsyListing(row.listingId));
      if (notice) notify(notice, { stage: "etsy-import", code: "OPEN_ETSY_LISTING_FAILED" });
    } catch (err) {
      notify({ type: "Error", title: "Open listing failed", message: err.message }, { stage: "etsy-import", code: "OPEN_ETSY_LISTING_FAILED" });
    }
  };

  const choice = (row, kind, text) => {
    const busy = busyKey === `${row.listingId}:${kind}`;
    return (
      <span className={styles.choice}>
        <span className={styles.choice_text}>{text}</span>
        <button
          type="button"
          className={styles.forget}
          disabled={busy}
          onClick={() => handleForget(row, kind)}
          title={`Forget this ${kind === FORGET_KIND.FABRIC ? "fabric" : "product type"}`}
          aria-label={`Forget the ${kind === FORGET_KIND.FABRIC ? "fabric" : "product type"} of ${choiceTitle(row)}`}
        >
          <LuX size={13} />
        </button>
      </span>
    );
  };

  return (
    <div className={sharedStyles.field}>
      <span className={sharedStyles.label}>Remembered choices per listing</span>
      <p className={sharedStyles.hint}>
        The fabric and the product type chosen in the Inbox bar for a listing whose order line does not name them (a snood, an apron). The next order of that listing goes
        through without asking. Forget one here to be asked again.
      </p>
      {loadError && (
        <p className={sharedStyles.field_error} role="alert">
          {loadError}
        </p>
      )}
      {!loadError && rows === null && <p className={sharedStyles.hint}>Reading...</p>}
      {rows !== null && rows.length === 0 && !loadError && <p className={sharedStyles.hint}>Nothing is remembered yet.</p>}
      {rows !== null && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.listingId} className={styles.row}>
              <span className={styles.title} title={choiceTitle(row)}>
                {choiceTitle(row)}
              </span>
              <span className={styles.choices}>
                {row.fabric ? choice(row, FORGET_KIND.FABRIC, row.fabric) : <span className={styles.none}>no fabric</span>}
                {row.printType ? choice(row, FORGET_KIND.PRINT_TYPE, printTypeLabel(row.printType)) : <span className={styles.none}>no product type</span>}
              </span>
              <button type="button" className={styles.open} onClick={() => handleListing(row)} title="Open listing in Etsy" aria-label={`Open ${choiceTitle(row)} in Etsy`}>
                <LuTag size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EtsyListingChoices;
