import { useMemo } from "react";
import { PRINTER_COLORS } from "@/constants/printerColors";
import { useStore } from "@/store/useStore";
import { resolveIcon } from "@/constants/rollbackReasonIcons";
import style from "./Summary.module.css";

const NO_DATA = "No data for this period";

const getReasonLabel = (code, label) => (code === "OTHER" ? "Other..." : label);

const Summary = ({ stats, isLoading }) => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);
  const reasonIconMap = useMemo(
    () => Object.fromEntries(reasonDefinitions.map((r) => [r.code, resolveIcon(r.iconName)])),
    [reasonDefinitions],
  );
  const { total, byReason, byPrinter, byProcess, byFabric } = stats;
  const maxReason = byReason[0]?.count || 1;
  const maxPrinter = byPrinter[0]?.count || 1;
  const maxProcess = byProcess[0]?.count || 1;
  const maxFabricMeters = byFabric[0]?.meters || 1;

  return (
    <div className={`${style.grid} ${isLoading ? style.loading : ""}`}>
      {/* Total rollbacks */}
      <div className={`${style.card} ${style.total_card}`}>
        <span className={style.card_title}>Total rollbacks</span>
        <span className={style.total_number}>{total}</span>
        <span className={style.total_sub}>rollbacks</span>
      </div>

      {/* By process */}
      <div className={`${style.card} ${style.process_card}`}>
        <span className={style.card_title}>By process</span>
        {byProcess.length === 0 ? (
          <span className={style.no_data}>{NO_DATA}</span>
        ) : (
          <div className={style.list}>
            {byProcess.map(({ process, count }) => {
              return (
                <div key={process} className={style.list_row}>
                  <span className={style.process_label}>
                    {process}
                  </span>
                  <div className={style.bar_track}>
                    <div
                      className={style.bar_fill}
                      style={{ width: `${(count / maxProcess) * 100}%`, background: "var(--bg-black)" }}
                    />
                  </div>
                  <span className={style.count}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* By printer */}
      <div className={`${style.card} ${style.printer_card}`}>
        <span className={style.card_title}>By printer</span>
        {byPrinter.length === 0 ? (
          <span className={style.no_data}>{NO_DATA}</span>
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
                      style={{ width: `${(count / maxPrinter) * 100}%`, background: "var(--bg-black)" }}
                    />
                  </div>
                  <span className={style.count}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top fabric */}
      <div className={`${style.card} ${style.fabric_card}`}>
        <span className={style.card_title}>Top Fabric</span>
        {byFabric.length === 0 ? (
          <span className={style.no_data}>{NO_DATA}</span>
        ) : (
          <div className={style.list}>
            {byFabric.map(({ fabric, meters }) => (
              <div key={fabric} className={style.list_row}>
                <span className={style.fabric_name}>{fabric}</span>
                <div className={style.bar_track}>
                  <div
                    className={style.bar_fill}
                    style={{ width: `${(meters / maxFabricMeters) * 100}%`, background: "var(--bg-black)" }}
                  />
                </div>
                <span className={style.meters_value}>{meters.toFixed(2)} m</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top reasons */}
      <div className={`${style.card} ${style.reasons_card}`}>
        <span className={style.card_title}>Top reasons</span>
        {byReason.length === 0 ? (
          <span className={style.no_data}>{NO_DATA}</span>
        ) : (
          <div className={style.list}>
            {byReason.map(({ reason_code, reason_label, count }, index) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const Icon = reasonIconMap[reason_code];
              return (
                <div key={reason_code} className={style.list_row}>
                  <span className={style.rank}>
                    {Icon ? <Icon /> : `#${index + 1}`}
                  </span>
                  <span className={style.reason_label}>
                    {getReasonLabel(reason_code, reason_label)}
                  </span>
                  <div className={style.bar_track}>
                    <div
                      className={style.bar_fill}
                      style={{ width: `${(count / maxReason) * 100}%`, background: "var(--bg-black)" }}
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
  );
};

export default Summary;
