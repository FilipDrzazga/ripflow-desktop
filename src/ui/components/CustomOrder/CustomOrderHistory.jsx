import { useState } from "react";
import { LuChevronRight, LuCheck, LuX, LuLayers, LuTrash2 } from "react-icons/lu";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { notify } from "@/utils/notify";
import { deleteCustomOrder } from "../../services/customOrderService";
import { showConfirm } from "../../services/systemService";
import styles from "./CustomOrderHistory.module.css";
import { CUSTOM_ORDER_STATUS } from "../../../shared/constants";

const formatDate = (isoString) => {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CustomOrderHistory = ({ history, onDeleted }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (e, order) => {
    e.stopPropagation();
    const ok = await showConfirm("Do you want to permanently delete this entry?");
    if (!ok) return;
    setDeletingId(order.id);
    try {
      const res = await deleteCustomOrder(order.id);
      if (res.success) {
        notify({
          type: "Success",
          title: "Entry deleted",
          message: `Custom order PO ${order.poNumber} removed from history.`,
        });
        onDeleted?.();
      } else {
        notify({ type: "Error", title: "Delete failed", message: res.error ?? "Could not delete entry." });
      }
    } catch (err) {
      notify({ type: "Error", title: "Delete failed", message: err?.message ?? "Could not delete entry." });
    }
    setDeletingId(null);
  };

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
          <div key={order.id} className={styles.card}>
            <div
              className={styles.card_header}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              role="button"
              aria-expanded={isExpanded}
            >
              <span className={`${styles.status_dot} ${isComplete ? styles.dot_complete : styles.dot_partial}`} />
              <LuLayers className={styles.file_icon} />
              <div className={styles.name_and_badge}>
                <span className={styles.material_name}>{order.materialName}</span>
                <span
                  className={styles.printer_badge}
                  style={{ backgroundColor: printerColor.bg, color: printerColor.color }}
                >
                  {order.printer}
                </span>
                {!isComplete && <span className={styles.header_missing}>{order.missingFiles} missing</span>}
              </div>
              <div className={styles.header_right}>
                <span className={styles.header_pill}>PO {order.poNumber}</span>
                <span className={styles.header_count}>
                  {order.totalFiles} files · {Number(order.totalMeters).toFixed(1)} m
                </span>
                <span className={styles.header_date}>{formatDate(order.date)}</span>
              </div>
              {files.length > 0 && (
                <LuChevronRight size={16} className={`${styles.chevron} ${isExpanded ? styles.chevron_open : ""}`} />
              )}
              <button
                type="button"
                className={styles.delete_btn}
                onClick={(e) => handleDelete(e, order)}
                disabled={deletingId === order.id}
                aria-label="Usuń wpis"
                title="Usuń wpis"
              >
                <LuTrash2 size={15} />
              </button>
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
                        <td className={`${styles.cell} ${styles.cell_meters}`}>{Number(file.meters).toFixed(1)}m</td>
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
