import { useState } from "react";
import { showConfirm } from "../../services/systemService";
import { clearRollbackReasons } from "../../services/analyticsService";
import { LuChartBar, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { useAnalyticsData } from "./hooks/useAnalyticsData";
import Summary from "./Summary/Summary";
import Details from "./Details/Details";
import style from "./Analytics.module.css";

const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "details", label: "Details" },
];

const Analytics = () => {
  const [period, setPeriod] = useState("30d");
  const [activeTab, setActiveTab] = useState("summary");
  const [isClearing, setIsClearing] = useState(false);
  const { stats, details, isLoading, refresh } = useAnalyticsData(period);

  const handleClearHistory = async () => {
    const confirmed = await showConfirm("Clear all rollback history? This cannot be undone.");
    if (!confirmed) return;
    setIsClearing(true);
    await clearRollbackReasons();
    setIsClearing(false);
    refresh();
  };

  return (
    <div className={style.analytics}>
      <div className={style.header}>
        <LuChartBar className={style.header_icon} />
        <span className={style.header_title}>Analytics</span>
        <div className={style.tabs}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              className={`${style.tab_btn} ${activeTab === id ? style.tab_btn_active : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={style.spacer} />
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
        <button className={style.clear_btn} onClick={handleClearHistory} disabled={isLoading || isClearing} title="Clear all rollback history">
          <LuTrash2 size={14} />
        </button>
        <button className={style.refresh_btn} onClick={refresh} disabled={isLoading} title="Refresh">
          <LuRefreshCw size={14} className={isLoading ? style.spinning : ""} />
        </button>
      </div>

      <div className={style.content}>
        {activeTab === "summary" && <Summary stats={stats} isLoading={isLoading} />}
        {activeTab === "details" && <Details details={details} isLoading={isLoading} />}
      </div>
    </div>
  );
};

export default Analytics;
