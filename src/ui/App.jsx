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
import { LuConstruction } from "react-icons/lu";

const PlaceholderView = ({ title }) => (
  <div className={styles.placeholder}>
    <LuConstruction size={36} />
    <span>{title} — coming soon</span>
  </div>
);

const App = () => {
  const refreshFiles = useStore((state) => state.refreshFiles);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("print");

  useEffect(() => {
    const fetchFolders = async () => {
      await refreshFiles({
        successTitle: "Folders loaded",
        successMessage: "The folder data has been successfully loaded.",
      });
    };
    fetchFolders();
  }, [refreshFiles]);

  return (
    <div className={styles.app}>
      <AlertsHost />
      {isLoading && <StartupLoader onDone={() => setIsLoading(false)} />}
      {!isLoading && (
        <>
          <NavBar activeView={activeView} onViewChange={setActiveView} />
          <main className={styles.content}>
            {activeView === "print" && (
              <>
                <DataOverviewSection />
                <DataFilters />
                <DataList />
              </>
            )}
            {activeView === "batch" && <PlaceholderView title="Batch" />}
            {activeView === "logs" && <PlaceholderView title="Logs" />}
            {activeView === "settings" && <PlaceholderView title="Settings" />}
          </main>
          <DataPrintSelection />
        </>
      )}
    </div>
  );
};

export default App;
