import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import { showConfirm } from "../../services/systemService";
import { LuTrash2, LuChevronRight, LuCopy, LuCheck } from "react-icons/lu";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import style from "./SessionLogs.module.css";

const TYPE_FILTERS = ["All", "Error", "Warning", "Success", "Info"];

const TYPE_META = {
  error:   { bg: "#fee2e2", color: "#b91c1c", label: "ERROR" },
  warning: { bg: "#fef3c7", color: "#b45309", label: "WARNING" },
  success: { bg: "#d1fae5", color: "#047857", label: "SUCCESS" },
  info:    { bg: "#dbeafe", color: "#1d4ed8", label: "INFO" },
};

const formatTime = (isoString) => new Date(isoString).toTimeString().slice(0, 8);

const LogEntry = ({ log }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = TYPE_META[log.type] || TYPE_META.info;
  const detailData = log.detail ?? { stage: log.stage, code: log.code };

  let detailJson;
  try {
    detailJson = JSON.stringify(detailData, null, 2);
  } catch {
    detailJson = String(detailData);
  }

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(detailJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      className={`${style.entry} ${expanded ? style.entry_expanded : ""}`}
      onClick={() => setExpanded((p) => !p)}
    >
      <div className={style.entry_row}>
        <span className={style.timestamp}>{formatTime(log.timestamp)}</span>
        <span className={style.type_badge} style={{ backgroundColor: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
        <span className={style.stage_pill}>{log.stage}</span>
        {log.workstation && (
          <span className={style.workstation_pill}>{log.workstation}</span>
        )}
        <span className={style.message}>{log.message}</span>
        <LuChevronRight
          size={15}
          className={`${style.chevron} ${expanded ? style.chevron_open : ""}`}
        />
      </div>
      {expanded && (
        <div className={style.detail_box}>
          <button
            type="button"
            className={`${style.copy_btn} ${copied ? style.copy_btn_done : ""}`}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <LuCheck size={13} /> : <LuCopy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <pre className={style.detail_pre}>{detailJson}</pre>
        </div>
      )}
    </div>
  );
};

const SessionLogs = () => {
  const logs = useStore((state) => state.logs);
  const clearLogs = useStore((state) => state.clearLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (typeFilter !== "All" && log.type !== typeFilter.toLowerCase()) return false;
      if (q) return log.message?.toLowerCase().includes(q) || log.code?.toLowerCase().includes(q);
      return true;
    });
  }, [logs, searchQuery, typeFilter]);

  const handleClear = async () => {
    const confirmed = await showConfirm("Clear all session logs? This cannot be undone.");
    if (!confirmed) return;
    await clearLogs();
    notify(
      { type: "Success", title: "Session logs cleared", message: "All log entries have been removed." },
      { stage: "logs", code: "LOGS_CLEARED" },
    );
  };

  return (
    <div className={style.container}>
      <div className={style.topbar}>
        <h2 className={style.title}>Session logs</h2>
        <span className={style.count_pill}>{logs.length}</span>
        <div className={style.search_wrapper}>
          <HiMagnifyingGlass className={style.search_icon} />
          <input
            className={style.search_input}
            type="text"
            placeholder="Search messages or codes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={style.search_clear} type="button" onClick={() => setSearchQuery("")}>
              <HiXMark />
            </button>
          )}
        </div>
        <div className={style.separator} />
        <div className={style.type_filters}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${style.filter_btn} ${typeFilter === f ? style.filter_btn_active : ""}`}
              onClick={() => setTypeFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button type="button" className={style.clear_btn} onClick={handleClear}>
          <LuTrash2 size={15} />
          Clear session
        </button>
      </div>

      <div className={style.list}>
        {filtered.length === 0 && (
          <div className={style.empty_state}>
            <span>{logs.length === 0 ? "No events yet." : "No results for current filters."}</span>
          </div>
        )}
        {filtered.map((log, i) => (
          <LogEntry key={log.id ?? i} log={log} />
        ))}
      </div>
    </div>
  );
};

export default SessionLogs;
