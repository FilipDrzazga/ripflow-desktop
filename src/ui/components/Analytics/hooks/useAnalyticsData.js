import { useState, useEffect, useCallback } from "react";
import { getRollbackStats, getRollbackDetails } from "../../../services/analyticsService";

const computeSince = (period) => {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const EMPTY_STATS = { total: 0, byReason: [], byPrinter: [], byProcess: [], byFabric: [] };

export function useAnalyticsData(period) {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [details, setDetails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const since = computeSince(period);
      const [statsRes, detailsRes] = await Promise.all([
        getRollbackStats(since),
        getRollbackDetails(since),
      ]);
      setStats(statsRes?.success ? statsRes.data : EMPTY_STATS);
      setDetails(detailsRes?.success ? detailsRes.data : []);
    } catch (err) {
      setError(err?.message ?? "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, details, isLoading, error, refresh };
}
