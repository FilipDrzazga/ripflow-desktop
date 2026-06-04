import { useState } from "react";
import { LuChevronRight, LuCheck, LuX, LuCircleCheck } from "react-icons/lu";
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

        return (
          <div key={idx} className={styles.item}>
            <div
              className={styles.item_header}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              role="button"
              aria-expanded={isExpanded}
            >
              <div className={styles.item_row}>
                <span className={styles.po_badge}>PO {order.poNumber}</span>
                <span className={styles.material_name}>{order.materialName}</span>
                <span
                  className={styles.printer_badge}
                  style={{ backgroundColor: printerColor.bg, color: printerColor.color }}
                >
                  {order.printer}
                </span>
                <span className={styles.meta}>{order.totalFiles} files</span>
                <span className={styles.meta}>{Number(order.totalMeters).toFixed(1)} m</span>
                <span className={styles.meta}>{formatDate(order.date)}</span>
              </div>
              <div className={styles.item_right}>
                {order.status === CUSTOM_ORDER_STATUS.COMPLETE ? (
                  <LuCircleCheck size={19} style={{ color: "#3B6D11" }} />
                ) : (
                  <span className={`${styles.status_badge} ${styles.partial}`}>
                    {`⚠ ${order.missingFiles} missing`}
                  </span>
                )}
                {files.length > 0 && (
                  <LuChevronRight
                    size={15}
                    className={`${styles.chevron} ${isExpanded ? styles.chevron_open : ""}`}
                  />
                )}
              </div>
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
