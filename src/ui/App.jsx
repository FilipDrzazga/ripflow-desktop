import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";
import DataFilters from "./components/DataFilters/DataFilters";
import StartupLoader from "./components/StartupLoader/StartupLoader";
import DataPrintSelection from "./components/DataPrintSelection/DataPrintSelection";
import DataOverviewSection from "./components/DataOverviewSection/DataOverviewSection";
import AlertsHost from "./components/AlertsHost/AlertsHost";
import NavBar from "./components/NavBar/NavBar";
import TitleBar from "./components/TitleBar/TitleBar";
import BatchHistory from "./components/BatchHistory/BatchHistory";
import SessionLogs from "./components/SessionLogs/SessionLogs";
import Settings from "./components/Settings/Settings";
import Analytics from "./components/Analytics/Analytics";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import CustomOrder from "./components/CustomOrder/CustomOrder";
import Production from "./components/Production/Production";
import { onDbError, onDbRecovered } from "./services/systemService";

const RIP_ERROR_POLL_INTERVAL = 30_000;

const App = () => {
  const refreshFiles = useStore((state) => state.refreshFiles);
  const refreshBatchDays = useStore((state) => state.refreshBatchDays);
  const loadLogsFromDb = useStore((state) => state.loadLogsFromDb);
  const loadHeldFiles = useStore((state) => state.loadHeldFiles);
  const loadReasonDefinitions = useStore((state) => state.loadReasonDefinitions);
  const loadFabricConfig = useStore((state) => state.loadFabricConfig);
  const loadRipErrors = useStore((state) => state.loadRipErrors);
  const dbDegraded = useStore((state) => state.dbDegraded);
  const setDbDegraded = useStore((state) => state.setDbDegraded);
  const checkDbDegraded = useStore((state) => state.checkDbDegraded);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("print");
  const startupFinishedRef = useRef(false);
  const safetyTimerRef = useRef(null);

  // Idempotent startup teardown. Normal path: StartupLoader animates to 100% and calls
  // this via onDone. Safety net: the 30s timer below calls it if readFolders hangs on a
  // dead network mount (where progress=100 never fires). Whichever runs first wins.
  const finishStartup = useCallback(() => {
    if (startupFinishedRef.current) return;
    startupFinishedRef.current = true;
    clearTimeout(safetyTimerRef.current);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Hard safety net ONLY for a hung scan (dead O: mount). Generous 30s so a slow-but-
    // alive scan is never cut short. The happy path closes via StartupLoader → onDone.
    safetyTimerRef.current = setTimeout(finishStartup, 30000);

    const fetchFolders = async () => {
      loadLogsFromDb();
      loadReasonDefinitions();
      loadFabricConfig();
      loadRipErrors();
      checkDbDegraded();
      await loadHeldFiles();
      await refreshFiles({
        successTitle: "Folders loaded",
        successMessage: "The folder data has been successfully loaded.",
      });
      refreshBatchDays();
    };
    fetchFolders();

    return () => clearTimeout(safetyTimerRef.current);
  }, [refreshFiles, refreshBatchDays, loadLogsFromDb, loadHeldFiles, loadReasonDefinitions, loadFabricConfig, loadRipErrors, finishStartup, checkDbDegraded]);

  // Global RIP-error poll — keeps the "RIP Error" badge fresh in BOTH Production and
  // BatchHistory for the whole session, independent of activeView. Mirrors Production's
  // setInterval/clear idiom. (Initial load fires in the startup effect above.)
  useEffect(() => {
    const id = setInterval(() => { loadRipErrors(); }, RIP_ERROR_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [loadRipErrors]);

  // DB degraded banner: main emits db:error/db:recovered only on state transition.
  useEffect(() => {
    const offError = onDbError(() => setDbDegraded(true));
    const offRecovered = onDbRecovered(() => setDbDegraded(false));
    return () => { offError?.(); offRecovered?.(); };
  }, [setDbDegraded]);

  return (
    <div className={styles.app}>
      <TitleBar />
      <AlertsHost />
      {dbDegraded && (
        <div className={styles.db_banner} role="alert">
          Database unavailable — changes may not be saved. Check the network connection.
        </div>
      )}
      {isLoading && <StartupLoader onDone={finishStartup} />}
      {!isLoading && (
        <div className={styles.body}>
          <NavBar activeView={activeView} onViewChange={setActiveView} />
          <main className={styles.content}>
            {activeView === "print" && (
              <>
                <DataOverviewSection />
                <DataFilters />
                <ErrorBoundary>
                  <DataList />
                </ErrorBoundary>
              </>
            )}
            {activeView === "batch" && (
              <ErrorBoundary>
                <BatchHistory />
              </ErrorBoundary>
            )}
            {activeView === "analytics" && (
              <ErrorBoundary>
                <Analytics />
              </ErrorBoundary>
            )}
            {activeView === "production" && (
              <ErrorBoundary>
                <Production />
              </ErrorBoundary>
            )}
            {activeView === "customOrder" && <CustomOrder />}
            {activeView === "logs" && <SessionLogs />}
            {activeView === "settings" && <Settings />}
          </main>
          <DataPrintSelection />
        </div>
      )}
    </div>
  );
};

export default App;
