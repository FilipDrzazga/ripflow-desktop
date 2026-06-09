import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { useStore } from "@/store/useStore";
import { clearRollbackReasons } from "../../../services/analyticsService";
import { clearCustomOrderHistory } from "../../../services/customOrderService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import styles from "./SettingsView.module.css";

const MaintenanceView = () => {
  const clearAllStages = useStore((s) => s.clearAllStages);
  const [isClearingAnalytics, setIsClearingAnalytics] = useState(false);
  const [isClearingCustomOrders, setIsClearingCustomOrders] = useState(false);

  const handleClearAnalytics = async () => {
    const confirmed = await showConfirm("Clear all rollback history? This cannot be undone.");
    if (!confirmed) return;
    setIsClearingAnalytics(true);
    await clearRollbackReasons();
    setIsClearingAnalytics(false);
    notify({ type: "Success", title: "History cleared", message: "All rollback history removed." });
  };

  const handleClearCustomOrders = async () => {
    const confirmed = await showConfirm("Clear all custom order history? This cannot be undone.");
    if (!confirmed) return;
    setIsClearingCustomOrders(true);
    try {
      const res = await clearCustomOrderHistory();
      if (res.success) {
        notify({ type: "Success", title: "History cleared", message: "All custom order history has been removed." });
      } else {
        notify({ type: "Error", title: "Clear failed", message: res.error ?? "Could not clear history." });
      }
    } catch (err) {
      notify({ type: "Error", title: "Clear failed", message: err?.message ?? "Could not clear history." });
    }
    setIsClearingCustomOrders(false);
  };

  const handleClearProduction = async () => {
    const confirmed = await showConfirm("Clear all production tracking data? This cannot be undone.");
    if (!confirmed) return;
    await clearAllStages();
    notify({ type: "Success", title: "Production cleared", message: "All tracking data removed." });
  };

  return (
    <div className={`${styles.view} ${styles.view_wide}`}>
      <div className={styles.view_header}>
        <h2 className={styles.view_title}>Maintenance</h2>
        <p className={styles.view_desc}>
          Destructive operations that affect shared data across all workstations. Cannot be undone.
        </p>
      </div>
      <div className={styles.view_body}>
        <div className={styles.action_row}>
          <div className={styles.action_info}>
            <span className={styles.label}>Rollback History</span>
            <p className={styles.hint}>Permanently deletes all rollback records used in Analytics.</p>
          </div>
          <button
            className={styles.danger_btn}
            onClick={handleClearAnalytics}
            disabled={isClearingAnalytics}
          >
            <LuTrash2 size={14} />
            {isClearingAnalytics ? "Clearing…" : "Clear History"}
          </button>
        </div>
        <div className={styles.action_row}>
          <div className={styles.action_info}>
            <span className={styles.label}>Custom Order History</span>
            <p className={styles.hint}>Permanently deletes all custom order import records.</p>
          </div>
          <button
            className={styles.danger_btn}
            onClick={handleClearCustomOrders}
            disabled={isClearingCustomOrders}
          >
            <LuTrash2 size={14} />
            {isClearingCustomOrders ? "Clearing…" : "Clear History"}
          </button>
        </div>
        <div className={styles.action_row}>
          <div className={styles.action_info}>
            <span className={styles.label}>Production Tracking</span>
            <p className={styles.hint}>Permanently removes all stage tracking data from the Production view.</p>
          </div>
          <button
            className={styles.danger_btn}
            onClick={handleClearProduction}
          >
            <LuTrash2 size={14} />
            Clear Production
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceView;
