import { LuFileText, LuCheck, LuTriangleAlert } from "react-icons/lu";
import { FILE_STATUS } from "../../../shared/constants";
import StageBadge from "../StageBadge/StageBadge";
import style from "./BatchHistory.module.css";

const formatRolledBackAt = (isoString) => {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${dd}/${mo}`;
};

const FileRow = ({ file, batch, stageRow, ripError, onRipBadgeClick, activeContextFilePath, onContextMenu, elementRefsRef, isSelected, onToggleSelect }) => {
  const isFileRolledBack = file.status === FILE_STATUS.ROLLED_BACK;
  const fileId = file.name.replace(/\.[^.]+$/, "");
  const rollbackReason = isFileRolledBack
    ? (batch.rollbackReasons?.find((r) => r.file_id === fileId) ??
       batch.rollbackReasons?.find((r) => r.file_id === null))
    : null;

  return (
    <li
      className={`${style.file_row} ${activeContextFilePath === file.path ? style.file_row_active : ""} ${isFileRolledBack ? style.file_row_rolled_back : ""} ${isSelected ? style.file_row_selected : ""} ${!isFileRolledBack ? style.file_row_selectable : ""}`}
      onClick={!isFileRolledBack ? () => onToggleSelect?.(file.path) : undefined}
      onContextMenu={
        isFileRolledBack
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(file, batch, e.clientX, e.clientY);
            }
      }
      ref={(el) => {
        if (el) elementRefsRef.current.set(`file:${file.path}`, el);
        else elementRefsRef.current.delete(`file:${file.path}`);
      }}
    >
      {!isFileRolledBack && (
        <span className={`${style.file_checkbox} ${isSelected ? style.file_checkbox_checked : ""}`}>
          {isSelected && <LuCheck size={10} />}
        </span>
      )}
      <LuFileText className={style.file_icon} />
      <span className={style.file_name_group}>
        <span className={style.file_name} title={file.name}>
          {file.name}
        </span>
        {file.manualOverride != null && (
          <span className={style.override_badge}>
            Override: {file.manualOverride.meters != null ? `${file.manualOverride.meters}m` : `x${file.manualOverride.qty}`}
          </span>
        )}
        {file.reprintQty != null && (
          <span className={style.reprint_badge}>
            Reprint: {file.type === "LM" ? `${file.reprintQty}m` : `x${file.reprintQty}`}
            {file.reprintQtyOriginal != null && file.reprintQtyOriginal !== file.reprintQty
              ? ` of ${file.type === "LM" ? `${file.reprintQtyOriginal}m` : `x${file.reprintQtyOriginal}`}`
              : ""}
          </span>
        )}
        {ripError && (
          <span
            className={style.rip_error_badge}
            onClick={(e) => { e.stopPropagation(); onRipBadgeClick?.(ripError, e.clientX, e.clientY); }}
          >
            <LuTriangleAlert size={11} />
            RIP Error
          </span>
        )}
      </span>
      {isFileRolledBack && file.rolledBackAt && (
        <span className={style.file_rolled_back_label}>
          Rolled back {formatRolledBackAt(file.rolledBackAt)}
        </span>
      )}
      {rollbackReason && (
        <span className={style.reason_badge}>{rollbackReason.reason_label}</span>
      )}
      {!isFileRolledBack && file.type && file.type !== "UNKNOWN" && (
        <span className={style.type_badge}>{file.type}</span>
      )}
      {!isFileRolledBack && stageRow?.stage && (
        <StageBadge stage={stageRow.stage} />
      )}
    </li>
  );
};

export default FileRow;
