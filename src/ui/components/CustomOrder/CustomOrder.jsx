import { useState, useEffect } from "react";
import { notify } from "@/utils/notify";
import CustomOrderCard from "./CustomOrderCard";
import CustomOrderHistory from "./CustomOrderHistory";
import { LuCloudUpload } from "react-icons/lu";
import styles from "./CustomOrder.module.css";

const CustomOrder = () => {
  const [csvGroups, setCsvGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const refreshHistory = () => {
    window.api.customOrder.getHistory().then((res) => {
      if (res.success) setHistory(res.data);
    });
  };

  useEffect(() => {
    window.api.customOrder.scanFolder().catch(() => {});
    refreshHistory();
  }, []);

  const handleFilePaths = async (filePaths) => {
    for (const csvPath of filePaths) {
      const uid = crypto.randomUUID();
      setCsvGroups((prev) => [...prev, { uid, isParsing: true, csvPath }]);

      const res = await window.api.customOrder.importCSV(csvPath);
      if (res.success) {
        setCsvGroups((prev) =>
          prev.map((g) => (g.uid === uid ? { uid, isParsing: false, ...res.data } : g))
        );
      } else {
        setCsvGroups((prev) => prev.filter((g) => g.uid !== uid));
        notify(
          { type: "Error", title: "CSV import failed", message: res.error ?? "Could not parse CSV." },
          { stage: "importCSV", code: "CSV_IMPORT_FAILED" }
        );
      }
    }
  };

  const handleSelectFiles = async () => {
    const res = await window.api.customOrder.selectCSV();
    if (!res.canceled && res.paths.length > 0) {
      handleFilePaths(res.paths);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const paths = [...e.dataTransfer.files]
      .filter((f) => f.name.toLowerCase().endsWith(".csv"))
      .map((f) => f.path);
    if (paths.length > 0) handleFilePaths(paths);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleGenerated = () => {
    refreshHistory();
  };

  return (
    <div className={styles.container}>
      <div className={styles.left_column}>
        <div
          className={`${styles.drop_zone} ${isDragging ? styles.dragging : ""} ${csvGroups.length === 0 ? styles.drop_zone_full : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleSelectFiles}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleSelectFiles()}
          aria-label="Import CSV files"
        >
          <LuCloudUpload size={24} className={styles.drop_icon} />
          <span className={styles.drop_text}>Drop CSV files here or click to browse</span>
        </div>

        {csvGroups.length > 0 && (
          <div className={styles.cards_list}>
            {csvGroups.map((group) => (
              <CustomOrderCard key={group.uid} group={group} onGenerated={handleGenerated} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.right_column}>
        <h3 className={styles.history_label}>Historia importów</h3>
        <CustomOrderHistory history={history} />
      </div>
    </div>
  );
};

export default CustomOrder;
