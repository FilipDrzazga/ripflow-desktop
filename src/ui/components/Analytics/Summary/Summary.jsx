import { PRINTER_COLORS } from "@/constants/printerColors";
import { ROLLBACK_REASONS } from "@/constants/rollbackReasons";
import style from "./Summary.module.css";

const REASON_ICON_MAP = Object.fromEntries(ROLLBACK_REASONS.map((r) => [r.code, r.icon]));

const PROCESS_COLORS = {
  Cottons: { bar: PRINTER_COLORS.DGEN.color, bg: PRINTER_COLORS.DGEN.bg, text: PRINTER_COLORS.DGEN.color },
  Polyesters: { bar: PRINTER_COLORS.YOKO.color, bg: PRINTER_COLORS.YOKO.bg, text: PRINTER_COLORS.YOKO.color },
  Unknown: { bar: "#9ca3af", bg: "#f3f4f6", text: "#6b7280" },
};

const NO_DATA = "No data for this period";

const getReasonLabel = (code, label) => (code === "OTHER" ? "Other..." : label);

const Summary = ({ stats, isLoading }) => {
  const { total, byReason, byPrinter, byWorkstation, byProcess } = stats;
  const maxReason = byReason[0]?.count || 1;
  const maxPrinter = byPrinter[0]?.count || 1;
  const maxWorkstation = byWorkstation[0]?.count || 1;
  const maxProcess = byProcess[0]?.count || 1;

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
              const colors = PROCESS_COLORS[process] || PROCESS_COLORS.Unknown;
              return (
                <div key={process} className={style.list_row}>
                  <span className={style.process_label} style={{ color: colors.text }}>
                    {process}
                  </span>
                  <div className={style.bar_track}>
                    <div
                      className={style.bar_fill}
                      style={{ width: `${(count / maxProcess) * 100}%`, background: colors.bar }}
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
                      style={{ width: `${(count / maxPrinter) * 100}%`, background: colors.color }}
                    />
                  </div>
                  <span className={style.count}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* By workstation */}
      <div className={`${style.card} ${style.workstation_card}`}>
        <span className={style.card_title}>By workstation</span>
        {byWorkstation.length === 0 ? (
          <span className={style.no_data}>{NO_DATA}</span>
        ) : (
          <div className={style.list}>
            {byWorkstation.map(({ workstation, count }) => (
              <div key={workstation} className={style.list_row}>
                <span className={style.ws_name}>{workstation}</span>
                <div className={style.bar_track}>
                  <div
                    className={style.bar_fill}
                    style={{ width: `${(count / maxWorkstation) * 100}%`, background: "var(--bg-black)" }}
                  />
                </div>
                <span className={style.count}>{count}</span>
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
              const Icon = REASON_ICON_MAP[reason_code];
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
