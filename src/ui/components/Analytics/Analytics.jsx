import { useCallback, useEffect, useState } from "react";
import { LuChartBar } from "react-icons/lu";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { ROLLBACK_REASONS } from "@/constants/rollbackReasons";
import style from "./Analytics.module.css";

const REASON_ICON_MAP = Object.fromEntries(ROLLBACK_REASONS.map((r) => [r.code, r.icon]));

const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const computeSince = (period) => {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const EMPTY_STATS = { total: 0, byReason: [], byPrinter: [], byWorkstation: [] };

// For OTHER reason code, show a fixed human-readable label instead of whatever custom text was first stored
const getReasonLabel = (reason_code, reason_label) =>
  reason_code === "OTHER" ? "Other..." : reason_label;

const Analytics = () => {
  const [period, setPeriod] = useState("30d");
  const [stats, setStats] = useState(EMPTY_STATS);

  const load = useCallback(async (p) => {
    const since = computeSince(p);
    const res = await window.api.getRollbackStats(since);
    setStats(res?.success ? res.data : EMPTY_STATS);
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const { total, byReason, byPrinter, byWorkstation } = stats;
  const maxReason = byReason[0]?.count || 1;
  const maxPrinter = byPrinter[0]?.count || 1;
  const maxWorkstation = byWorkstation[0]?.count || 1;

  return (
    <div className={style.analytics}>
      <div className={style.header}>
        <LuChartBar className={style.header_icon} />
        <span className={style.header_title}>Analytics</span>
        <div className={style.period_toggle}>
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              className={`${style.period_btn} ${period === id ? style.period_btn_active : ""}`}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={style.grid}>
        {/* Total Rollbacks */}
        <div className={`${style.card} ${style.total_card}`}>
          <span className={style.card_title}>Total rollbacks</span>
          <span className={style.total_number}>{total}</span>
          <span className={style.total_sub}>rollbacks</span>
        </div>

        {/* By Printer */}
        <div className={`${style.card} ${style.printer_card}`}>
          <span className={style.card_title}>By printer</span>
          {byPrinter.length === 0 ? (
            <span className={style.no_data}>No data for this period</span>
          ) : (
            <div className={style.list}>
              {byPrinter.map(({ printer, count }) => {
                const colors = PRINTER_COLORS[printer] || { bg: "#f1f1f1", color: "#616161" };
                return (
                  <div key={printer} className={style.list_row}>
                    <span
                      className={style.printer_badge}
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      {printer}
                    </span>
                    <div className={style.bar_track}>
                      <div
                        className={style.bar_fill}
                        style={{
                          width: `${(count / maxPrinter) * 100}%`,
                          background: colors.color,
                        }}
                      />
                    </div>
                    <span className={style.count}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Workstation */}
        <div className={`${style.card} ${style.workstation_card}`}>
          <span className={style.card_title}>By workstation</span>
          {byWorkstation.length === 0 ? (
            <span className={style.no_data}>No data for this period</span>
          ) : (
            <div className={style.list}>
              {byWorkstation.map(({ workstation, count }) => (
                <div key={workstation} className={style.list_row}>
                  <span className={style.ws_name}>{workstation}</span>
                  <div className={style.bar_track}>
                    <div
                      className={style.bar_fill}
                      style={{
                        width: `${(count / maxWorkstation) * 100}%`,
                        background: "var(--bg-black)",
                      }}
                    />
                  </div>
                  <span className={style.count}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Reasons */}
        <div className={`${style.card} ${style.reasons_card}`}>
          <span className={style.card_title}>Top reasons</span>
          {byReason.length === 0 ? (
            <span className={style.no_data}>No data for this period</span>
          ) : (
            <div className={style.list}>
              {byReason.map(({ reason_code, reason_label, count }, index) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={reason_code} className={style.list_row}>
                    <span className={style.rank}>
                      {REASON_ICON_MAP[reason_code] ? (
                        (() => { const Icon = REASON_ICON_MAP[reason_code]; return <Icon />; })()
                      ) : `#${index + 1}`}
                    </span>
                    <span className={style.reason_label}>
                      {getReasonLabel(reason_code, reason_label)}
                    </span>
                    <div className={style.bar_track}>
                      <div
                        className={style.bar_fill}
                        style={{
                          width: `${(count / maxReason) * 100}%`,
                          background: "var(--bg-black)",
                        }}
                      />
                    </div>
                    <span className={style.count}>{count}</span>
                    <span className={style.pct}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
