import { useState, useEffect } from "react";
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

const App = () => {
  const refreshFiles = useStore((state) => state.refreshFiles);
  const refreshBatchDays = useStore((state) => state.refreshBatchDays);
  const loadLogsFromDb = useStore((state) => state.loadLogsFromDb);
  const loadHeldFiles = useStore((state) => state.loadHeldFiles);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("print");

  useEffect(() => {
    const fetchFolders = async () => {
      loadLogsFromDb();
      loadHeldFiles();
      await refreshFiles({
        successTitle: "Folders loaded",
        successMessage: "The folder data has been successfully loaded.",
      });
      refreshBatchDays();
    };
    fetchFolders();
  }, [refreshFiles, refreshBatchDays, loadLogsFromDb, loadHeldFiles]);

  return (
    <div className={styles.app}>
      <TitleBar />
      <AlertsHost />
      {isLoading && <StartupLoader onDone={() => setIsLoading(false)} />}
      {!isLoading && (
        <div className={styles.body}>
          <NavBar activeView={activeView} onViewChange={setActiveView} />
          <main className={styles.content}>
            {activeView === "print" && (
              <>
                <DataOverviewSection />
                <DataFilters />
                <DataList />
              </>
            )}
            {activeView === "batch" && <BatchHistory />}
            {activeView === "custom_order" && null}
            {activeView === "analytics" && null}
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
