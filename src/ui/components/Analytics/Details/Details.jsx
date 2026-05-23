import { useMemo, useState } from "react";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { ROLLBACK_REASONS } from "@/constants/rollbackReasons";
import { LuDownload, LuLayoutGrid, LuList } from "react-icons/lu";
import style from "./Details.module.css";

const PROCESS_OPTIONS = ["All", "Cottons", "Polyesters"];
const PRINTER_OPTIONS = ["All", "DGEN", "YOKO", "YUMI"];

const PROCESS_BADGE = {
  Cottons: { bg: PRINTER_COLORS.DGEN.bg, color: PRINTER_COLORS.DGEN.color },
  Polyesters: { bg: PRINTER_COLORS.YOKO.bg, color: PRINTER_COLORS.YOKO.color },
};

const REASON_LABELS = Object.fromEntries(ROLLBACK_REASONS.map((r) => [r.code, r.label]));

const getDisplayReason = (code, label) => {
  if (code === "OTHER") return label || "Other...";
  return REASON_LABELS[code] || label || code;
};

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB") + " " + d.toTimeString().slice(0, 5);
};

const formatDateKey = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

const Details = ({ details, isLoading }) => {
  const [processFilter, setProcessFilter] = useState("All");
  const [printerFilter, setPrinterFilter] = useState("All");
  const [reasonFilter, setReasonFilter] = useState("All");
  const [splitByDay, setSplitByDay] = useState(false);
  const [viewMode, setViewMode] = useState("list");

  const uniqueReasons = useMemo(() => {
    const seen = new Set();
    const out = [{ code: "All", label: "All reasons" }];
    for (const row of details) {
      if (!seen.has(row.reason_code)) {
        seen.add(row.reason_code);
        out.push({ code: row.reason_code, label: getDisplayReason(row.reason_code, row.reason_label) });
      }
    }
    return out;
  }, [details]);

  const filtered = useMemo(() => {
    return details.filter((row) => {
      if (processFilter !== "All" && row.process !== processFilter) return false;
      if (printerFilter !== "All" && row.printer !== printerFilter) return false;
      if (reasonFilter !== "All" && row.reason_code !== reasonFilter) return false;
      return true;
    });
  }, [details, processFilter, printerFilter, reasonFilter]);

  const handleExportCsv = () => {
    const header = ["Date", "OrderID", "Customer", "Fabric", "Process", "Printer", "Reason", "Workstation"];
    const rows = filtered.map((row) => [
      formatDate(row.timestamp),
      row.order_id ?? "",
      row.customer ?? "",
      row.fabric ?? "",
      row.process ?? "",
      row.printer ?? "",
      getDisplayReason(row.reason_code, row.reason_label),
      row.workstation ?? "",
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

        <select
          className={style.reason_select}
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
        >
          {uniqueReasons.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>

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

        <div className={style.view_toggle}>
          <button
            className={`${style.view_btn} ${viewMode === "list" ? style.view_btn_active : ""}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <LuList size={15} />
          </button>
          <button
            className={`${style.view_btn} ${viewMode === "grid" ? style.view_btn_active : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <LuLayoutGrid size={15} />
          </button>
        </div>

        <button className={style.export_btn} onClick={handleExportCsv} disabled={isEmpty}>
          <LuDownload size={14} />
          Export CSV
        </button>
      </div>

      {/* Content */}
      <div className={style.content}>
        {isEmpty ? (
          <div className={style.empty_state}>No rollbacks found for selected filters</div>
        ) : viewMode === "list" ? (
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
                  <th>Workstation</th>
                </tr>
              </thead>
              <tbody>
                {splitByDay && dayGroups
                  ? dayGroups.map(([key, rows]) => (
                      <>
                        <tr key={`day-${key}`} className={style.day_separator}>
                          <td colSpan={8}>
                            <span className={style.day_label}>
                              {formatDateKey(rows[0]?.timestamp)} — {rows.length} entries
                            </span>
                          </td>
                        </tr>
                        {rows.map((row) => (
                          <TableRow key={row.id} row={row} />
                        ))}
                      </>
                    ))
                  : filtered.map((row) => <TableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={style.card_grid}>
            {splitByDay && dayGroups
              ? dayGroups.map(([key, rows]) => (
                  <div key={`day-${key}`} className={style.day_section}>
                    <div className={style.day_header}>
                      {formatDateKey(rows[0]?.timestamp)} — {rows.length} entries
                    </div>
                    {rows.map((row) => (
                      <GridCard key={row.id} row={row} />
                    ))}
                  </div>
                ))
              : filtered.map((row) => <GridCard key={row.id} row={row} />)}
          </div>
        )}
      </div>
    </div>
  );
};

const TableRow = ({ row }) => (
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
    <td className={style.td_ws}>{row.workstation || "—"}</td>
  </tr>
);

const GridCard = ({ row }) => (
  <div className={style.grid_card}>
    <div className={style.grid_card_reason}>
      {getDisplayReason(row.reason_code, row.reason_label)}
    </div>
    <div className={style.grid_card_row}>
      <span className={style.grid_card_key}>Order</span>
      <span className={style.grid_card_value}>{row.order_id || "—"}</span>
    </div>
    <div className={style.grid_card_row}>
      <span className={style.grid_card_key}>Customer</span>
      <span className={style.grid_card_value}>{row.customer || "—"}</span>
    </div>
    <div className={style.grid_card_row}>
      <span className={style.grid_card_key}>Fabric</span>
      <span className={style.grid_card_value}>{row.fabric || "—"}</span>
    </div>
    <div className={style.grid_card_badges}>
      <ProcessBadge process={row.process} />
      <PrinterBadge printer={row.printer} />
    </div>
    <div className={style.grid_card_footer}>
      <span className={style.grid_card_date}>{formatDate(row.timestamp)}</span>
      {row.workstation && <span className={style.grid_card_ws}>{row.workstation}</span>}
    </div>
  </div>
);

export default Details;
