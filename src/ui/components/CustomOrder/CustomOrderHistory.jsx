import { useState } from "react";
import { LuChevronRight, LuCheck, LuX } from "react-icons/lu";
import { PRINTER_COLORS } from "@/constants/printerColors";
import styles from "./CustomOrderHistory.module.css";
import { CUSTOM_ORDER_STATUS } from "../../../shared/constants";

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
        const isComplete = order.status === CUSTOM_ORDER_STATUS.COMPLETE;

        return (
          <div key={idx} className={styles.card}>
            <div
              className={styles.card_header}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              role="button"
              aria-expanded={isExpanded}
            >
              <span className={`${styles.status_dot} ${isComplete ? styles.dot_complete : styles.dot_partial}`} />
              <div className={styles.name_and_badge}>
                <span className={styles.material_name}>{order.materialName}</span>
                <span
                  className={styles.printer_badge}
                  style={{ backgroundColor: printerColor.bg, color: printerColor.color }}
                >
                  {order.printer}
                </span>
                {!isComplete && (
                  <span className={styles.header_missing}>{order.missingFiles} missing</span>
                )}
              </div>
              <div className={styles.header_right}>
                <span className={styles.header_pill}>PO {order.poNumber}</span>
                <span className={styles.header_count}>
                  {order.totalFiles} files · {Number(order.totalMeters).toFixed(1)} m
                </span>
                <span className={styles.header_date}>{formatDate(order.date)}</span>
              </div>
              {files.length > 0 && (
                <LuChevronRight
                  size={16}
                  className={`${styles.chevron} ${isExpanded ? styles.chevron_open : ""}`}
                />
              )}
            </div>

            {isExpanded && files.length > 0 && (
              <div className={styles.content}>
                <table className={styles.file_table}>
                  <tbody>
                    {files.map((file, fIdx) => (
                      <tr key={fIdx} className={styles.file_row}>
                        <td className={`${styles.cell} ${styles.cell_icon}`}>
                          {file.found ? (
                            <LuCheck size={14} className={styles.icon_found} />
                          ) : (
                            <LuX size={14} className={styles.icon_missing} />
                          )}
                        </td>
                        <td className={styles.cell}>
                          <span className={`${styles.file_name} ${!file.found ? styles.file_name_missing : ""}`}>
                            {file.fileName}
                          </span>
                        </td>
                        <td className={`${styles.cell} ${styles.cell_meters}`}>
                          {Number(file.meters).toFixed(1)}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CustomOrderHistory;
