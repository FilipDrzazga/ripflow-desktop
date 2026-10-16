import { useCallback, useEffect, useRef, useState } from "react";
import { getCloudDayMetres } from "../services/cloudService";
import { usePollingPaused } from "./usePollingPaused";

// The tile reads again every 5 minutes (main answers from its cache within a minute, and a job
// that finished is rarely older than that to anyone looking at the tile). Like every poll it
// stands while the polls stand (usePollingPaused) and reads once at once when they run again -
// the effect depends on that flag, so the resume tick comes from the dependency.
const POLL_MS = 5 * 60_000;

// status: "loading" (nothing yet) | "unconfigured" (no key on this station) | "ready" | "error".
// An error keeps the last good numbers in `data`: a dropped connection must not blank the tile.
export const useCloudDayMetres = () => {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const stopped = usePollingPaused();
  const inFlightRef = useRef(false);
  // True while a read is running: the tile shows it, because a click on the tile (`reload`) otherwise
  // looks like nothing happened while main answers.
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
    try {
      const res = await getCloudDayMetres();
      if (!res?.success) {
        setState((prev) => ({ status: "error", data: prev.data, error: res?.error?.message ?? "PrintFactory Cloud could not be read." }));
      } else if (!res.data.configured) {
        setState({ status: "unconfigured", data: null, error: null });
      } else {
        setState({ status: "ready", data: res.data, error: null });
      }
    } catch {
      setState((prev) => ({ status: "error", data: prev.data, error: "PrintFactory Cloud did not answer in time." }));
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (stopped) return undefined;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [stopped, load]);

  // `reload` runs when the operator clicks the tile: main still answers from its cache inside a minute.
  return { ...state, refreshing, reload: load };
};
