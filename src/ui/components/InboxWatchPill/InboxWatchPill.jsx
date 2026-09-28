import { LuArrowUp, LuCloudOff } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { inboxPillLabel } from "../../utils/inboxWatch";
import styles from "./InboxWatchPill.module.css";

// ETAP 4 (4-inbox): the pill at the top of the Print list - "3 new files - click to refresh" (and
// "N files gone" when files on the list left the inbox), or a grey "Can't check the inbox" when
// the last look failed. A click is the Refresh button (store.refreshInbox); the pill goes away
// with the refresh. No toast, no sound: a toast every 30 s would fill Logs.
const InboxWatchPill = () => {
  const watch = useStore((s) => s.inboxWatch);
  const isRefreshing = useStore((s) => s.isRefreshingFiles);
  const refreshInbox = useStore((s) => s.refreshInbox);
  const label = inboxPillLabel(watch);
  if (!label || isRefreshing) return null;

  if (watch.error) {
    return (
      <div className={styles.wrap}>
        <span className={`${styles.pill} ${styles.pill_error}`} title="The inbox folders could not be read - the list may be out of date">
          <LuCloudOff size={14} />
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.pill} onClick={() => refreshInbox()}>
        <LuArrowUp size={14} />
        {label}
      </button>
    </div>
  );
};

export default InboxWatchPill;
