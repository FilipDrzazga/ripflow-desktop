import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LuArrowUp, LuCloudOff } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { inboxPillLabel } from "../../utils/inboxWatch";
import styles from "./InboxWatchPill.module.css";

// ETAP 4 (4-inbox): the pill at the top of the Print list - "3 new files - click to refresh" (and
// "N files gone" when files on the list left the inbox), or a grey "Can't check the inbox" when
// the last look failed. A click is the Refresh button (store.refreshInbox). No toast, no sound: a
// toast every 30 s would fill Logs.
//
// It FLOATS over the list (FILIP 2026-09-29): a zero-height sticky anchor holds it, so showing or
// hiding it never pushes the list down or makes it jump back up. GSAP fades it in and out; the
// last text stays mounted while it fades out, so the pill does not go blank mid-animation.
const InboxWatchPill = () => {
  const watch = useStore((s) => s.inboxWatch);
  const isRefreshing = useStore((s) => s.isRefreshingFiles);
  const refreshInbox = useStore((s) => s.refreshInbox);
  const label = inboxPillLabel(watch);
  const visible = !!label && !isRefreshing;

  // What the pill shows - kept after it hides, for the fade-out. Adjusted during render instead of
  // in an effect (react-hooks/set-state-in-effect, the same pattern as FabricsView).
  const [shown, setShown] = useState(null);
  if (visible && (shown?.label !== label || shown?.error !== watch.error)) setShown({ label, error: watch.error });

  const pillRef = useRef(null);
  useGSAP(
    () => {
      if (!pillRef.current) return;
      if (visible) {
        gsap.to(pillRef.current, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out", overwrite: true });
      } else {
        gsap.to(pillRef.current, { autoAlpha: 0, y: -8, duration: 0.25, ease: "power2.in", overwrite: true });
      }
    },
    { dependencies: [visible] },
  );

  return (
    <div className={styles.anchor}>
      <div ref={pillRef} className={styles.float}>
        {shown?.error ? (
          <span className={`${styles.pill} ${styles.pill_error}`} title="The inbox folders could not be read - the list may be out of date">
            <LuCloudOff size={14} />
            {shown.label}
          </span>
        ) : shown ? (
          <button type="button" className={styles.pill} onClick={() => refreshInbox()} disabled={!visible}>
            <LuArrowUp size={14} />
            {shown.label}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default InboxWatchPill;
