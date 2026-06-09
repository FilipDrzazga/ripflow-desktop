import { useState } from "react";
import { LuChartBar } from "react-icons/lu";
import { useAnalyticsData } from "./hooks/useAnalyticsData";
import Details from "./Details/Details";
import style from "./Analytics.module.css";

const Analytics = () => {
  const [period, setPeriod] = useState("7d");
  const { stats, details, isLoading, refresh } = useAnalyticsData(period);

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
          onRefresh={refresh}
        />
      </div>
    </div>
  );
};

export default Analytics;
