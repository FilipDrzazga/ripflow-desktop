import { useState } from "react";
import { showConfirm } from "../../services/systemService";
import { clearRollbackReasons } from "../../services/analyticsService";
import { LuChartBar } from "react-icons/lu";
import { useAnalyticsData } from "./hooks/useAnalyticsData";
import Details from "./Details/Details";
import style from "./Analytics.module.css";

const Analytics = () => {
  const [period, setPeriod] = useState("7d");
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
      </div>

      <div className={style.content}>
        <Details
          details={details}
          stats={stats}
          isLoading={isLoading}
          period={period}
          onPeriodChange={setPeriod}
          onClear={handleClearHistory}
          onRefresh={refresh}
          isClearing={isClearing}
        />
      </div>
    </div>
  );
};

export default Analytics;
