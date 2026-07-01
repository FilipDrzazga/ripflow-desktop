import { useState, useEffect } from "react";
import { notify } from "@/utils/notify";
import { LuChevronRight, LuCheck, LuX, LuPlay, LuTrash2, LuScanLine, LuFileText } from "react-icons/lu";
import { PRINTER_COLORS } from "@/constants/printerColors";
import styles from "./CustomOrderCard.module.css";
import { generateCustomOrderXML } from "../../services/customOrderService";
import { PRINTER } from "../../../shared/constants";

const PRINTERS = [PRINTER.YOKO, PRINTER.YUMI];

const CustomOrderCard = ({ group, onGenerated, onRefresh, onRemove }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(() => new Set());

  // Default-select every file exactly once, the moment CSV parsing finishes
  // (isParsing true -> false). A later rescan (onRefresh) never flips isParsing
  // back to true, so this does not re-run then — existing checkbox choices
  // survive a refresh. A fileName that only appears for the first time after a
  // rescan is NOT auto-selected (starts unchecked) — accepted edge case, not a bug.
  useEffect(() => {
    if (!group.isParsing && group.files) {
      setSelectedFiles(new Set(group.files.map((f) => f.fileName)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.isParsing]);

  if (group.isParsing) {
    return (
      <div className={styles.card}>
        <div className={`${styles.card_header} ${styles.parsing}`}>
          <span className={`${styles.status_dot} ${styles.dot_parsing}`} />
          <div className={styles.header_meta}>
            <span className={styles.material_name}>Importing CSV…</span>
            <span className={styles.header_subtitle}>{group.csvPath?.replace(/.*[/\\]/, "") ?? ""}</span>
          </div>
        </div>
        <div className={styles.parsing_bar}>
          <div className={styles.parsing_bar_inner} />
        </div>
      </div>
    );
  }

  const { poNumber, materialName, files = [], missingCount = 0 } = group;

  const dotClass = missingCount > 0 ? styles.dot_partial : styles.dot_ready;

  const toggleFileSelection = (fileName) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  };

  // Mirrors totalMeters's existing inclusion rule (sums metersToprint regardless
  // of `found`) — missing files inflating the total is a pre-existing quirk,
  // untouched by this selection feature.
  const selectedTotalMeters = files.reduce(
    (sum, f) => (selectedFiles.has(f.fileName) ? sum + f.metersToprint : sum),
    0,
  );

  const handleGenerate = async () => {
    if (!selectedPrinter) {
      notify(
        { type: "Warning", title: "No printer selected", message: "Please select a printer before generating XML." },
        { stage: "generateXML", code: "NO_PRINTER_SELECTED" },
      );
      return;
    }
    if (selectedFiles.size === 0) {
      notify(
        { type: "Warning", title: "No files selected", message: "Select at least one file before generating XML." },
        { stage: "generateXML", code: "NO_FILES_SELECTED" },
      );
      return;
    }
    setIsGenerating(true);
    try {
      const selected = files.filter((f) => selectedFiles.has(f.fileName));
      const res = await generateCustomOrderXML({
        poNumber,
        materialName,
        printer: selectedPrinter,
        files: selected,
        totalMeters: selectedTotalMeters,
      });
      if (res.success) {
        setIsGenerated(true);
        notify(
          { type: "Success", title: "XML generated", message: `Order ${poNumber} sent to ${selectedPrinter}.` },
          { stage: "generateXML", code: "XML_GENERATED" },
        );
        onGenerated?.();
      } else {
        notify(
          { type: "Error", title: "XML generation failed", message: res.error ?? "Unknown error." },
          { stage: "generateXML", code: "XML_GENERATION_FAILED" },
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.card}>
      <div
        className={styles.card_header}
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        aria-expanded={isExpanded}
      >
        <span className={`${styles.status_dot} ${dotClass}`} />
        <LuFileText className={styles.file_icon} />
        <div className={styles.name_and_badge}>
          <span className={styles.material_name}>{materialName}</span>
          <span className={styles.poly_badge}>POLYESTERS</span>
          {missingCount > 0 && (
            <span className={styles.header_missing}>
              {missingCount} missing
            </span>
          )}
        </div>
        <div className={styles.header_right}>
          <span
            className={styles.header_pill}
            style={{ backgroundColor: "var(--bg-grey-light)", color: "var(--text-secondary)" }}
          >
            PO {poNumber}
          </span>
          <span className={styles.header_count}>
            {files.length} {files.length === 1 ? "file" : "files"} · {selectedTotalMeters.toFixed(1)} m
          </span>
        </div>
        <div className={styles.printer_toggles} onClick={(e) => e.stopPropagation()}>
          {PRINTERS.map((p) => {
            const isActive = selectedPrinter === p;
            const colors = PRINTER_COLORS[p];
            return (
              <button
                key={p}
                type="button"
                className={`${styles.printer_toggle} ${isActive ? styles.printer_toggle_active : ""}`}
                style={isActive ? { backgroundColor: colors.bg, color: colors.color } : {}}
                onClick={() => {
                  if (!isGenerating && !isGenerated) setSelectedPrinter(p);
                }}
                disabled={isGenerating || isGenerated}
              >
                {p}
              </button>
            );
          })}
        </div>
        <div className={styles.card_actions} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`${styles.generate_btn} ${isGenerated ? styles.btn_generated : ""}`}
            title={isGenerated ? "XML generated" : isGenerating ? "Generating…" : "Generate XML"}
            onClick={handleGenerate}
            disabled={isGenerating || isGenerated}
          >
            {isGenerated ? <LuCheck size={16} /> : <LuPlay size={16} />}
          </button>
          <button
            type="button"
            className={styles.rescan_btn}
            title="Re-scan folder and refresh file status"
            disabled={isRefreshing || isGenerated}
            onClick={async () => {
              setIsRefreshing(true);
              try {
                await onRefresh?.();
              } finally {
                setIsRefreshing(false);
              }
            }}
          >
            <LuScanLine size={16} className={isRefreshing ? styles.spinning : ""} />
          </button>
          <button
            type="button"
            className={styles.remove_btn}
            title="Remove"
            onClick={() => onRemove?.()}
          >
            <LuTrash2 size={16} />
          </button>
        </div>
        <LuChevronRight size={16} className={`${styles.chevron} ${isExpanded ? styles.chevron_open : ""}`} />
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <table className={styles.file_table}>
            <tbody>
              {files.map((file, idx) => {
                const isSelected = selectedFiles.has(file.fileName);
                const checkboxLocked = isGenerating || isGenerated;
                return (
                  <tr key={idx} className={styles.file_row}>
                    <td className={`${styles.cell} ${styles.cell_checkbox}`}>
                      <span
                        className={`${styles.card_checkbox} ${isSelected ? styles.card_checkbox_checked : ""} ${checkboxLocked ? styles.card_checkbox_disabled : ""}`}
                        onClick={() => !checkboxLocked && toggleFileSelection(file.fileName)}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !checkboxLocked) {
                            e.preventDefault();
                            toggleFileSelection(file.fileName);
                          }
                        }}
                      >
                        {isSelected && <LuCheck size={10} />}
                      </span>
                    </td>
                    <td className={`${styles.cell} ${styles.cell_icon}`}>
                      {file.found ? (
                        <LuCheck size={14} className={styles.icon_found} />
                      ) : (
                        <LuX size={14} className={styles.icon_missing} />
                      )}
                    </td>
                    <td className={styles.cell}>
                      <div className={styles.file_name_wrap}>
                        <span className={`${styles.file_name} ${!file.found ? styles.file_name_missing : ""}`}>
                          {file.fileName}
                        </span>
                      </div>
                    </td>
                    <td className={`${styles.cell} ${styles.cell_meters}`}>{file.metersToprint.toFixed(1)}m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={styles.footer}>
            {missingCount > 0 ? (
              <span className={styles.footer_missing}>
                {missingCount} file{missingCount !== 1 ? "s" : ""} not found on disk
              </span>
            ) : (
              <span>
                {files.length} files · {selectedTotalMeters.toFixed(1)}m total
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomOrderCard;
