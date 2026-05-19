import { PRINTER_COLORS } from "@/constants/printerColors";
import styles from "./CustomOrderHistory.module.css";

const formatDate = (isoString) => {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CustomOrderHistory = ({ history }) => {
  if (history.length === 0) {
    return <div className={styles.empty}>No import history yet.</div>;
  }

  return (
    <div className={styles.container}>
      {history.map((order, idx) => {
        const printerColor = PRINTER_COLORS[order.printer] || { bg: "#f1f5f9", color: "#334155" };
        return (
          <div key={idx} className={styles.item}>
            <div className={styles.item_top}>
              <span className={styles.po_number}>{order.poNumber}</span>
              <span className={styles.material_name}>{order.materialName}</span>
              <span className={`${styles.status_badge} ${styles[order.status]}`}>
                {order.status === "complete"
                  ? "✓ complete"
                  : `⚠ ${order.missingFiles} missing`}
              </span>
            </div>
            <div className={styles.item_bottom}>
              <span
                className={styles.printer_badge}
                style={{ backgroundColor: printerColor.bg, color: printerColor.color }}
              >
                {order.printer}
              </span>
              <span>{order.totalFiles} files</span>
              <span>{Number(order.totalMeters).toFixed(1)}m</span>
              <span>{formatDate(order.date)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CustomOrderHistory;
