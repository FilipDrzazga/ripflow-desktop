import { useCallback, useEffect, useRef, useState } from "react";
import { LuBan, LuChevronDown, LuCircleX, LuClock, LuRotateCw, LuSparkles, LuTag, LuTriangleAlert } from "react-icons/lu";
import { SiEtsy } from "react-icons/si";
import EtsyThumb from "./EtsyThumb";
import ErrorBoundary from "../ErrorBoundary/ErrorBoundary";
import { useStore } from "../../store/useStore";
import { usePollingPaused, useOnPollingResume } from "../../hooks/usePollingPaused";
import { isFeatureEnabled } from "../../utils/featureVisibility";
import { notify } from "../../utils/notify";
import { openEtsyOrder } from "../../utils/orderLink";
import { showConfirm } from "../../services/systemService";
import { listEtsyImports, retryEtsyImport, dismissEtsyImport, openEtsyListing } from "../../services/etsyImportService";
import {
  ETSY_BAR_POLL_MS,
  barTitle,
  canRetry,
  dismissConfirmMessage,
  dismissNotice,
  etsyOrderIdOf,
  initialXwdInput,
  isInterrupted,
  lineKey,
  lineTitle,
  listingNotice,
  readXwdInput,
  retryConfirmMessage,
  retryNotice,
  stateChip,
  statusText,
  statusTitle,
  suggestionOf,
  suggestionFileNote,
  suggestionText,
  withoutTyped,
} from "../../utils/etsyImportBar";
import styles from "./EtsyImportBar.module.css";

const STATE_ICON = { warn: LuTriangleAlert, bad: LuCircleX, wait: LuClock };

// Plan E4b: the order lines of the Etsy import that wait for a person, above the Inbox table, on EVERY station.
// It only reads the list and WRITES REQUESTS (Retry with a typed XWD number, Dismiss); the copy into the inbox is
// always the importer station's. Shown only with features.etsy and at least one open line. Opens INLINE - a modal
// would be an aria-modal layer over the Inbox, and the operator is meant to keep working in the table.
const EtsyImportBarContent = () => {
  const shopProfile = useStore((s) => s.shopProfile);
  const enabled = isFeatureEnabled("etsy", shopProfile);
  const pollingPaused = usePollingPaused();

  const [rows, setRows] = useState([]);
  const [importerHere, setImporterHere] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [typed, setTyped] = useState({}); // line key -> text of the field, once the person touched it
  const [fieldError, setFieldError] = useState({}); // line key -> message
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // A list that could not be read keeps the rows on screen: the bar never blanks because of one bad answer.
  const load = useCallback(async () => {
    try {
      const res = await listEtsyImports();
      if (!aliveRef.current || !res?.success || !Array.isArray(res.data)) return;
      setRows(res.data);
      setImporterHere(res.importerHere === true);
    } catch (err) {
      console.error("[EtsyImportBar] list failed:", err);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || pollingPaused) return undefined;
    const id = setInterval(load, ETSY_BAR_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, pollingPaused, load]);

  useOnPollingResume(() => {
    if (enabled) load();
  });

  if (!enabled || rows.length === 0) return null;

  const valueOf = (row) => typed[lineKey(row)] ?? initialXwdInput(row);

  const setValue = (row, text) => {
    const key = lineKey(row);
    setTyped((prev) => ({ ...prev, [key]: text.replace(/\D/g, "").slice(0, 6) }));
    setFieldError((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
  };

  const handleRetry = async (row) => {
    const key = lineKey(row);
    const read = readXwdInput(valueOf(row));
    if (!read.ok) {
      setFieldError((prev) => ({ ...prev, [key]: read.message }));
      return;
    }
    if (isInterrupted(row) && !(await showConfirm(retryConfirmMessage(row)))) return;
    setBusyKey(key);
    let written = false;
    try {
      const res = await retryEtsyImport({ receiptId: row.receiptId, transactionId: row.transactionId, xwd: read.value });
      written = res?.success === true && res.updated === true;
      notify(retryNotice(res, row), { stage: "etsy-import", code: res?.success ? "ETSY_RETRY" : "ETSY_RETRY_FAILED" });
    } catch (err) {
      notify({ type: "Error", title: "Etsy retry failed", message: err.message }, { stage: "etsy-import", code: "ETSY_RETRY_FAILED" });
    } finally {
      if (aliveRef.current) setBusyKey(null);
      await load();
      // The request is in the database: from now on the field shows what the database holds (manualXwd), not
      // what was typed here - another station may change it. After the reload, so it never flashes the old number.
      if (written && aliveRef.current) setTyped((prev) => withoutTyped(prev, key));
    }
  };

  const handleDismiss = async (row) => {
    if (!(await showConfirm(dismissConfirmMessage(row)))) return;
    const key = lineKey(row);
    setBusyKey(key);
    try {
      const res = await dismissEtsyImport({ receiptId: row.receiptId, transactionId: row.transactionId });
      notify(dismissNotice(res, row), { stage: "etsy-import", code: res?.success ? "ETSY_DISMISS" : "ETSY_DISMISS_FAILED" });
    } catch (err) {
      notify({ type: "Error", title: "Dismissing the Etsy line failed", message: err.message }, { stage: "etsy-import", code: "ETSY_DISMISS_FAILED" });
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

  return (
    <section className={`${styles.bar} ${open ? styles.bar_open : ""}`} aria-label="Etsy order lines that need a person">
      <button type="button" className={styles.header} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <SiEtsy size={16} className={styles.header_icon} />
        <span className={styles.header_title}>{barTitle(rows)}</span>
        <span className={styles.header_toggle}>
          {open ? "Hide" : "Show"}
          <LuChevronDown size={16} className={`${styles.chevron} ${open ? styles.chevron_open : ""}`} />
        </span>
      </button>
      {/* Stays mounted so the height can slide (grid rows 0fr <-> 1fr); inert while closed keeps its fields and
          buttons out of the Tab order and away from the pointer. */}
      <div className={`${styles.list_wrap} ${open ? styles.list_wrap_open : ""}`} inert={!open}>
        <div className={styles.list_clip}>
          <ul className={styles.list}>
            {rows.map((row) => {
              const key = lineKey(row);
              const busy = busyKey === key;
              const error = fieldError[key];
              const suggestion = suggestionOf(row);
              const chip = stateChip(row);
              const StateIcon = STATE_ICON[chip.tone] ?? LuTriangleAlert;
              return (
                <li key={key} className={styles.line}>
                  <EtsyThumb listingId={row.listingId} enabled={open} />
                  <div className={styles.line_text}>
                    {/* The name and the state with its reason (FILIP 2026-10-22 15:30 + 16:33): the order number lives behind
                        the Etsy button and the quantity is not the person's question here. The reason is cut with an
                        ellipsis; the state, the whole reason and the waiting hint are the badge's tooltip. */}
                    <span className={styles.line_title} title={lineTitle(row)}>
                      {lineTitle(row)}
                    </span>
                    <span className={`${styles.status} ${styles[`status_${chip.tone}`]}`} title={statusTitle(row, importerHere)}>
                      <StateIcon size={13} className={styles.status_icon} role="img" aria-label={chip.text} />
                      <span className={styles.line_reason}>{statusText(row, importerHere)}</span>
                    </span>
                  </div>
                  <div className={styles.actions}>
                    {suggestion && (
                      <span className={styles.suggestion_slot}>
                        {valueOf(row) !== suggestion && (
                          <button type="button" className={styles.suggestion} disabled={busy} onClick={() => setValue(row, suggestion)} title={suggestionText(suggestion) + suggestionFileNote(row)}>
                            <LuSparkles size={12} />
                            XWD{suggestion}
                          </button>
                        )}
                      </span>
                    )}
                    <input
                      className={`${styles.input} ${error ? styles.input_error : ""}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="XWD number"
                      aria-label="XWD number, six digits"
                      title="XWD number, six digits"
                      value={valueOf(row)}
                      disabled={busy || !canRetry(row)}
                      onChange={(e) => setValue(row, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canRetry(row) && !busy) handleRetry(row);
                      }}
                      aria-invalid={error ? "true" : undefined}
                    />
                    {/* Icon buttons in the Batch tab's style (FILIP 2026-10-22 16:33); the words are the tooltip and the
                        accessible name. */}
                    <button type="button" className={`${styles.action_btn} ${styles.action_success}`} disabled={busy || !canRetry(row)} onClick={() => handleRetry(row)} title="Retry" aria-label="Retry">
                      <LuRotateCw size={14} />
                    </button>
                    <button type="button" className={`${styles.action_btn} ${styles.action_danger}`} disabled={busy} onClick={() => handleDismiss(row)} title="Not a print - never import this line" aria-label="Not a print">
                      <LuBan size={14} />
                    </button>
                    <span className={styles.actions_divider} aria-hidden="true" />
                    {/* The two ways out to Etsy at the right end (FILIP 2026-10-22 16:33). A line without a listing keeps
                        the place, so the columns line up. */}
                    <div className={styles.line_links}>
                      <button type="button" className={`${styles.action_btn} ${styles.action_etsy}`} onClick={() => openEtsyOrder(etsyOrderIdOf(row))} title="Open order in Etsy" aria-label="Open order in Etsy">
                        <SiEtsy size={13} />
                      </button>
                      {row.listingId ? (
                        <button type="button" className={`${styles.action_btn} ${styles.action_info}`} onClick={() => handleListing(row)} title="Open listing in Etsy" aria-label="Open listing in Etsy">
                          <LuTag size={14} />
                        </button>
                      ) : (
                        <span className={styles.icon_spacer} aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  {error && <div className={styles.field_error}>{error}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
};

// The bar is mounted ONLY with its own boundary (S2 2026-10-22 14:23): an error inside it - a render of an
// unexpected row, a future effect - leaves a small "Something went wrong / Try again" strip in its place, never
// the whole window down with the Inbox under it (FILIP 14:19). Inside this module, so no mount of the bar can
// forget it.
const EtsyImportBar = () => (
  <ErrorBoundary compact>
    <EtsyImportBarContent />
  </ErrorBoundary>
);

export default EtsyImportBar;
