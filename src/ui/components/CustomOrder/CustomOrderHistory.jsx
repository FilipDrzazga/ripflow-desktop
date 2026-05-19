import { useState } from "react";
import { LuChevronRight, LuCheck, LuX } from "react-icons/lu";
import { PRINTER_COLORS } from "@/constants/printerColors";
import styles from "./CustomOrderHistory.module.css";

const formatDate = (isoString) => {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CustomOrderHistory = ({ history }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (history.length === 0) {
    return <div className={styles.empty}>No import history yet.</div>;
  }

  return (
    <div className={styles.container}>
      {history.map((order, idx) => {
        const printerColor = PRINTER_COLORS[order.printer] || { bg: "#f1f5f9", color: "#334155" };
        const isExpanded = expandedIdx === idx;
        const files = order.files ?? [];

        return (
          <div key={idx} className={styles.item}>
            <div
              className={styles.item_header}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              role="button"
              aria-expanded={isExpanded}
            >
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
                <span>{Number(order.totalMeters).toFixed(1)} m</span>
                <span>{formatDate(order.date)}</span>
              </div>
              {files.length > 0 && (
                <LuChevronRight
                  size={15}
                  className={`${styles.chevron} ${isExpanded ? styles.chevron_open : ""}`}
                />
              )}
            </div>

            {isExpanded && files.length > 0 && (
              <div className={styles.files_list}>
                {files.map((file, fIdx) => (
                  <div key={fIdx} className={styles.file_row}>
                    <span className={file.found ? styles.icon_found : styles.icon_missing}>
                      {file.found ? <LuCheck size={13} /> : <LuX size={13} />}
                    </span>
                    <span className={`${styles.file_name} ${!file.found ? styles.file_name_missing : ""}`}>
                      {file.fileName}
                    </span>
                    <span className={styles.file_meters}>{Number(file.meters).toFixed(1)} m</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CustomOrderHistory;
