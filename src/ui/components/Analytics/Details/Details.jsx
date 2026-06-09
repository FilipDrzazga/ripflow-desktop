import { useEffect, useMemo, useRef, useState } from "react";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
import { useStore } from "@/store/useStore";
import { LuDownload, LuRefreshCw, LuChevronDown, LuChevronUp, LuFilter, LuSearch, LuX } from "react-icons/lu";
import Summary from "../Summary/Summary";
import style from "./Details.module.css";
import { PRINTER } from "../../../../shared/constants";

const PROCESS_OPTIONS = ["All", "Cottons", "Polyesters"];
const PRINTER_OPTIONS = ["All", PRINTER.DGEN, PRINTER.YOKO, PRINTER.YUMI];
const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const PROCESS_BADGE = {
  Cottons: { bg: PRINTER_COLORS.DGEN.bg, color: PRINTER_COLORS.DGEN.color },
  Polyesters: { bg: PRINTER_COLORS.YOKO.bg, color: PRINTER_COLORS.YOKO.color },
};

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mo}/${yyyy} ${hh}:${mm}`;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const formatDateKey = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const groupByDay = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = row.timestamp ? row.timestamp.slice(0, 10) : "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].sort((a, b) => (b[0] > a[0] ? 1 : -1));
};

const ProcessBadge = ({ process }) => {
  const colors = PROCESS_BADGE[process];
  if (!colors) return <span className={style.badge_neutral}>{process || "—"}</span>;
  return (
    <span className={style.badge} style={{ background: colors.bg, color: colors.color }}>
      {process}
    </span>
  );
};

const PrinterBadge = ({ printer }) => {
  if (!printer) return <span className={style.badge_neutral}>—</span>;
  const colors = PRINTER_COLORS[printer] || { bg: "#f1f1f1", color: "#616161" };
  return (
    <span className={style.badge} style={{ background: colors.bg, color: colors.color }}>
      {printer}
    </span>
  );
};

const TypeBadge = ({ printType }) => {
  const def = PRINT_TYPE_MAP[printType];
  if (!def) return <span className={style.badge_neutral}>—</span>;
  return (
    <span className={style.type_badge}>
      <def.Icon style={{ fontSize: 14, color: def.color }} />
      <span style={{ color: def.color }}>{def.label}</span>
    </span>
  );
};

const Details = ({ details, stats, isLoading, period, onPeriodChange, onRefresh }) => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);
  const reasonLabels = useMemo(
    () => Object.fromEntries(reasonDefinitions.map((r) => [r.code, r.label])),
    [reasonDefinitions],
  );
  const getDisplayReason = (code, label) => {
    if (code === "OTHER") return label || "Other...";
    return reasonLabels[code] || label || code;
  };
  const [processFilter, setProcessFilter] = useState("All");
  const [printerFilter, setPrinterFilter] = useState("All");
  const [reasonFilter, setReasonFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [splitByDay, setSplitByDay] = useState(true);
  const reasonRef = useRef(null);

  useEffect(() => {
    if (!reasonOpen) return;
    const handleClick = (e) => {
      if (!reasonRef.current?.contains(e.target)) setReasonOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [reasonOpen]);

  const uniqueReasons = useMemo(() => {
    const seen = new Set();
    const out = [{ code: "All", label: "All reasons" }];
    for (const row of details) {
      if (!seen.has(row.reason_code)) {
        seen.add(row.reason_code);
        const label = row.reason_code === "OTHER"
          ? "Other"
          : (reasonLabels[row.reason_code] || row.reason_label || row.reason_code);
        out.push({ code: row.reason_code, label });
      }
    }
    return out;
  }, [details, reasonLabels]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return details.filter((row) => {
      if (processFilter !== "All" && row.process !== processFilter) return false;
      if (printerFilter !== "All" && row.printer !== printerFilter) return false;
      if (reasonFilter !== "All" && row.reason_code !== reasonFilter) return false;
      if (q) {
        const fabricMatch = (row.fabric ?? "").toLowerCase().includes(q);
        const reasonMatch = getDisplayReason(row.reason_code, row.reason_label).toLowerCase().includes(q);
        if (!fabricMatch && !reasonMatch) return false;
      }
      return true;
    });
  }, [details, processFilter, printerFilter, reasonFilter, searchQuery]);

  const handleExportCsv = () => {
    const header = ["Date", "OrderID", "Customer", "Fabric", "Process", "Printer", "Reason", "Type", "Meters"];
    const rows = filtered.map((row) => [
      formatDate(row.timestamp),
      row.order_id ?? "",
      row.customer ?? "",
      row.fabric ?? "",
      row.process ?? "",
      row.printer ?? "",
      getDisplayReason(row.reason_code, row.reason_label),
      row.print_type ?? "",
      row.meters != null ? row.meters.toFixed(2) : "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ripflow-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dayGroups = useMemo(() => (splitByDay ? groupByDay(filtered) : null), [filtered, splitByDay]);

  const isEmpty = filtered.length === 0;

  return (
    <div className={`${style.details} ${isLoading ? style.loading : ""}`}>
      <div className={style.body}>
        <Summary stats={stats} isLoading={isLoading} />

        <div className={style.right_panel}>
          {/* Filters bar */}
          <div className={style.filters}>
            <div className={style.filter_group}>
              {PROCESS_OPTIONS.map((p) => (
                <button
                  key={p}
                  className={`${style.filter_btn} ${processFilter === p ? style.filter_btn_active : ""}`}
                  onClick={() => setProcessFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={style.separator} />

            <div className={style.filter_group}>
              {PRINTER_OPTIONS.map((p) => (
                <button
                  key={p}
                  className={`${style.filter_btn} ${printerFilter === p ? style.filter_btn_active : ""}`}
                  onClick={() => setPrinterFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={style.separator} />

            <div className={style.reason_wrapper} ref={reasonRef}>
              <button
                type="button"
                className={`${style.reason_btn} ${reasonFilter !== "All" ? style.reason_btn_active : ""}`}
                onClick={() => setReasonOpen((v) => !v)}
              >
                <span className={style.reason_btn_label}>
                  <LuFilter size={14} />
                  {uniqueReasons.find((r) => r.code === reasonFilter)?.label ?? "All reasons"}
                </span>
                <span className={style.reason_chevron}>
                  {reasonOpen ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />}
                </span>
              </button>
              {reasonOpen && (
                <div className={style.reason_dropdown}>
                  {uniqueReasons.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      className={`${style.reason_option} ${reasonFilter === code ? style.reason_option_active : ""}`}
                      onClick={() => {
                        setReasonFilter(code);
                        setReasonOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={style.separator} />

            <div className={style.search_wrapper}>
              <LuSearch size={13} className={style.search_icon} />
              <input
                type="text"
                className={style.search_input}
                placeholder="Fabric or reason…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={style.search_clear} onClick={() => setSearchQuery("")}>
                  <LuX size={12} />
                </button>
              )}
            </div>

            <div className={style.separator} />

            <label className={style.toggle_label}>
              <input
                type="checkbox"
                className={style.toggle_checkbox}
                checked={splitByDay}
                onChange={(e) => setSplitByDay(e.target.checked)}
              />
              Split by day
            </label>

            <div className={style.spacer} />

            <div className={style.period_group}>
              {PERIODS.map(({ id, label }) => (
                <button
                  key={id}
                  className={`${style.period_btn} ${period === id ? style.period_btn_active : ""}`}
                  onClick={() => onPeriodChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={style.end_separator} />

            <button className={style.export_btn} onClick={handleExportCsv} disabled={isEmpty}>
              <LuDownload size={14} />
              Export CSV
            </button>
            <button className={`${style.icon_btn} ${isLoading ? style.icon_btn_active : ""}`} onClick={onRefresh} disabled={isLoading} title="Refresh">
              <LuRefreshCw size={15} className={isLoading ? style.spinning : ""} />
            </button>
          </div>

          {/* Table */}
          <div className={style.content}>
          {isEmpty ? (
            <div className={style.empty_state}>No rollbacks found for selected filters</div>
          ) : (
            <div className={style.table_wrapper}>
              <table className={style.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Fabric</th>
                    <th>Process</th>
                    <th>Printer</th>
                    <th>Reason</th>
                    <th>Type</th>
                    <th>Meters</th>
                  </tr>
                </thead>
                <tbody>
                  {splitByDay && dayGroups
                    ? dayGroups.map(([key, rows]) => (
                        <>
                          <tr key={`day-${key}`} className={style.day_separator}>
                            <td colSpan={9}>
                              <span className={style.day_label}>
                                {formatDateKey(rows[0]?.timestamp)} — {rows.length} entries
                              </span>
                            </td>
                          </tr>
                          {rows.map((row) => (
                            <TableRow key={row.id} row={row} getDisplayReason={getDisplayReason} />
                          ))}
                        </>
                      ))
                    : filtered.map((row) => <TableRow key={row.id} row={row} getDisplayReason={getDisplayReason} />)}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TableRow = ({ row, getDisplayReason }) => (
  <tr className={style.table_row}>
    <td className={style.td_date}>{formatDate(row.timestamp)}</td>
    <td className={style.td_mono}>{row.order_id || "—"}</td>
    <td>{row.customer || "—"}</td>
    <td className={style.td_fabric}>{row.fabric || "—"}</td>
    <td>
      <ProcessBadge process={row.process} />
    </td>
    <td>
      <PrinterBadge printer={row.printer} />
    </td>
    <td className={style.td_reason}>{getDisplayReason(row.reason_code, row.reason_label)}</td>
    <td><TypeBadge printType={row.print_type} /></td>
    <td className={style.td_meters}>{row.meters != null ? `${row.meters.toFixed(2)} m` : "—"}</td>
  </tr>
);

export default Details;
