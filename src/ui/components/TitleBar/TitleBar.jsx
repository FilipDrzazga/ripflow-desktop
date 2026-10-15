import { useEffect, useState } from "react";
import { LuMinus, LuSquare, LuCopy, LuX } from "react-icons/lu";
import {
  minimizeWindow,
  toggleMaximizeWindow,
  onWindowMaximizedChanged,
  isWindowMaximized,
  closeWindow,
} from "../../services/systemService";
import styles from "./TitleBar.module.css";
import ripflowWordmark from "@/assets/image/ripflow_wordmark.png";

const TitleBar = () => {
  // The state lives in the main process: a double click on the drag region switches it without any
  // click here, so the icon follows the window's own events (+ one snapshot for a reloaded renderer).
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onWindowMaximizedChanged((payload) => setMaximized(payload?.maximized === true));
    isWindowMaximized()
      .then((res) => {
        if (!cancelled && typeof res?.maximized === "boolean") setMaximized(res.maximized);
      })
      .catch((err) => console.error("[TitleBar] isWindowMaximized failed:", err));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className={styles.titlebar}>
      <div className={styles.logo_col}>
        <img src={ripflowWordmark} alt="RipFlow" className={styles.logo} draggable={false} />
      </div>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={minimizeWindow} aria-label="Minimize" title="Minimize">
          <LuMinus size={14} />
        </button>
        <button
          className={styles.btn}
          onClick={toggleMaximizeWindow}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? <LuCopy size={14} /> : <LuSquare size={14} />}
        </button>
        <button className={`${styles.btn} ${styles.close}`} onClick={closeWindow} aria-label="Close" title="Close">
          <LuX size={14} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
