import { useEffect } from "react";
import { LuRefreshCw, LuFolderOpen, LuCornerUpLeft, LuTrash2, LuChevronRight, LuChevronDown, LuPrinter } from "react-icons/lu";
import { BATCH_STATUS, FILE_STATUS } from "../../../shared/constants";
import { PRINTER_COLORS } from "../../constants/printerColors";
import { useStore } from "../../store/useStore";
import FileRow from "./FileRow";
import style from "./BatchHistory.module.css";

const BatchRow = ({
  batch,
  isBatchExpanded,
  onToggle,
  onRegenerateXml,
  onOpenInFolder,
  onSetRollbackModal,
  onDeleteBatch,
  onContextMenu,
  elementRefsRef,
  activeContextFilePath,
  canPrintLabel,
  onPrintLabel,
  selectedFilePaths,
  onToggleFileSelect,
}) => {
  const productionStages = useStore((s) => s.productionStages);
  const loadStagesForBatch = useStore((s) => s.loadStagesForBatch);
  const ripErrors = useStore((s) => s.ripErrors);

  useEffect(() => {
    if (isBatchExpanded) loadStagesForBatch(batch.path);
  }, [isBatchExpanded, batch.path, loadStagesForBatch]);

  const isRolledBack = batch.status === BATCH_STATUS.ROLLED_BACK;
  const rolledBackCount = batch.files.filter((f) => f.status === FILE_STATUS.ROLLED_BACK).length;
  const printerColors = PRINTER_COLORS[batch.printer] || { bg: "#f0f0f0", color: "#555" };
  const batchLevelReason = isRolledBack
    ? (batch.rollbackReasons?.find((r) => r.file_id === null) ?? batch.rollbackReasons?.[0] ?? null)
    : null;

  // Distinct errored files in THIS batch (this batch's files ∩ open ripErrors). Same stem
  // derivation + same store source FileRow uses, so this equals the number of red "RIP Error"
  // file badges shown once the batch is expanded.
  const ripErrorCount = batch.files.reduce(
    (n, f) => n + (ripErrors[f.name.replace(/\.[^.]+$/, "")] ? 1 : 0),
    0,
  );

  return (
    <div
      className={`${style.batch_group} ${isRolledBack ? style.batch_rolled_back : ""}`}
      ref={(el) => {
        if (el) elementRefsRef.current.set(`batch:${batch.path}`, el);
        else elementRefsRef.current.delete(`batch:${batch.path}`);
      }}
    >
      <div className={style.batch_row} onClick={() => onToggle(batch.path)}>
        <div className={style.batch_expand_btn}>
          {isBatchExpanded ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
        </div>
        <div className={style.batch_name_group}>
          <span className={style.batch_name} title={batch.name}>
            {batch.name}
          </span>
          {rolledBackCount > 0 && (
            <span className={style.rolled_back_badge}>{rolledBackCount} rolled back</span>
          )}
          {ripErrorCount > 0 && (
            <span className={style.rip_error_count_badge}>
              {ripErrorCount} RIP Error{ripErrorCount === 1 ? "" : "s"}
            </span>
          )}
          {batchLevelReason && (
            <span className={style.reason_badge}>{batchLevelReason.reason_label}</span>
          )}
        </div>
        <span
          className={style.printer_badge}
          style={{ backgroundColor: printerColors.bg, color: printerColors.color }}
        >
          {batch.printer}
        </span>
        <span className={style.file_count}>
          {batch.fileCount} {batch.fileCount === 1 ? "file" : "files"}
          {batch.printLengthM > 0 && ` · ${batch.printLengthM} m`}
        </span>
        <span
          className={style.xml_dot}
          style={{ backgroundColor: batch.xmlExists ? "#639922" : "#E24B4A" }}
          title={batch.xmlExists ? "XML exists" : "XML missing"}
        />
        <div className={style.batch_actions}>
          {!isRolledBack && (
            <>
              {canPrintLabel && (
                <button
                  type="button"
                  className={`${style.action_btn} ${style.action_label}`}
                  title="Print label"
                  onClick={(e) => { e.stopPropagation(); onPrintLabel(batch.name, batch.printLengthM); }}
                >
                  <LuPrinter size={16} />
                </button>
              )}
              <button
                type="button"
                className={`${style.action_btn} ${style.action_success}`}
                title="Regenerate XML"
                onClick={(e) => { e.stopPropagation(); onRegenerateXml(batch.path); }}
              >
                <LuRefreshCw size={16} />
              </button>
              <button
                type="button"
                className={`${style.action_btn} ${style.action_info}`}
                title="Open in Explorer"
                onClick={(e) => { e.stopPropagation(); onOpenInFolder(batch.path); }}
              >
                <LuFolderOpen size={16} />
              </button>
              <button
                type="button"
                className={`${style.action_btn} ${style.action_danger}`}
                title="Rollback batch"
                onClick={(e) => { e.stopPropagation(); onSetRollbackModal({ batchName: batch.name, batchPath: batch.path }); }}
              >
                <LuCornerUpLeft size={16} />
              </button>
            </>
          )}
          {isRolledBack && (
            <button
              type="button"
              className={`${style.action_btn} ${style.action_danger}`}
              title="Delete empty batch folder"
              onClick={(e) => { e.stopPropagation(); onDeleteBatch(batch.path); }}
            >
              <LuTrash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {isBatchExpanded && batch.files.length > 0 && (
        <ul className={style.batch_files}>
          {batch.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              batch={batch}
              stageRow={productionStages[file.name.replace(/\.[^.]+$/, "")]}
              ripError={ripErrors[file.name.replace(/\.[^.]+$/, "")]}
              activeContextFilePath={activeContextFilePath}
              onContextMenu={onContextMenu}
              elementRefsRef={elementRefsRef}
              isSelected={selectedFilePaths?.has(file.path) ?? false}
              onToggleSelect={(filePath) => onToggleFileSelect?.(filePath, batch.path)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default BatchRow;
