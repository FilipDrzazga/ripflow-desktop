import { LuFileText } from "react-icons/lu";
import { FILE_STATUS } from "../../../shared/constants";
import style from "./BatchHistory.module.css";

const formatRolledBackAt = (isoString) => {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${dd}/${mo}`;
};

const FileRow = ({ file, batch, activeContextFilePath, onContextMenu, elementRefsRef }) => {
  const isFileRolledBack = file.status === FILE_STATUS.ROLLED_BACK;
  const fileId = file.name.replace(/\.[^.]+$/, "");
  const rollbackReason = isFileRolledBack
    ? (batch.rollbackReasons?.find((r) => r.file_id === fileId) ??
       batch.rollbackReasons?.find((r) => r.file_id === null))
    : null;

  return (
    <li
      className={`${style.file_row} ${activeContextFilePath === file.path ? style.file_row_active : ""} ${isFileRolledBack ? style.file_row_rolled_back : ""}`}
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
      <LuFileText className={style.file_icon} />
      <span className={style.file_name} title={file.name}>
        {file.name}
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
    </li>
  );
};

export default FileRow;
