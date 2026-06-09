import { useState, useEffect } from "react";
import { notify } from "@/utils/notify";
import CustomOrderCard from "./CustomOrderCard";
import CustomOrderHistory from "./CustomOrderHistory";
import { LuCloudUpload } from "react-icons/lu";
import styles from "./CustomOrder.module.css";
import {
  scanCustomOrderFolder,
  importCSVContent,
  getCustomOrderHistory,
  selectCustomOrderCSV,
} from "../../services/customOrderService";

const CustomOrder = () => {
  const [csvGroups, setCsvGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const refreshHistory = () =>
    getCustomOrderHistory()
      .then((res) => { if (res.success) setHistory(res.data); })
      .catch(() => {});

  useEffect(() => {
    scanCustomOrderFolder().catch(() => {});
    refreshHistory();
  }, []);

  const handleCSVFiles = async (csvFiles) => {
    for (const { name, content } of csvFiles) {
      const uid = crypto.randomUUID();
      setCsvGroups((prev) => [...prev, { uid, isParsing: true, csvPath: name }]);
      try {
        const res = await importCSVContent(content);
        if (res.success) {
          setCsvGroups((prev) => prev.map((g) => (g.uid === uid ? { uid, isParsing: false, csvContent: content, ...res.data } : g)));
        } else {
          setCsvGroups((prev) => prev.filter((g) => g.uid !== uid));
          notify(
            { type: "Error", title: "CSV import failed", message: res.error ?? "Could not parse CSV." },
            { stage: "importCSV", code: "CSV_IMPORT_FAILED" },
          );
        }
      } catch (err) {
        setCsvGroups((prev) => prev.filter((g) => g.uid !== uid));
        notify(
          { type: "Error", title: "CSV import failed", message: err?.message ?? "Could not parse CSV." },
          { stage: "importCSV", code: "CSV_IMPORT_FAILED" },
        );
      }
    }
  };

  const handleSelectFiles = async () => {
    const res = await selectCustomOrderCSV();
    if (!res.canceled && res.files.length > 0) {
      await handleCSVFiles(res.files);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const csvFiles = await Promise.all(
      droppedFiles.map(async (f) => ({ name: f.name, content: await f.text() })),
    );
    await handleCSVFiles(csvFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleRefreshGroup = async (uid, csvContent) => {
    await scanCustomOrderFolder();
    const res = await importCSVContent(csvContent);
    if (res.success) {
      setCsvGroups((prev) =>
        prev.map((g) =>
          g.uid === uid ? { uid, isParsing: false, csvContent, ...res.data } : g,
        ),
      );
    }
  };

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
              <CustomOrderCard
                key={group.uid}
                group={group}
                onGenerated={handleGenerated}
                onRefresh={() => handleRefreshGroup(group.uid, group.csvContent)}
                onRemove={() => setCsvGroups((prev) => prev.filter((g) => g.uid !== group.uid))}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.right_column}>
        <div className={styles.right_topbar}>
          <h2 className={styles.history_label}>Custom Order History</h2>
        </div>
        <CustomOrderHistory history={history} />
      </div>
    </div>
  );
};

export default CustomOrder;
