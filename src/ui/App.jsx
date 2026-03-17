import { useState, useEffect } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";
import DataFilters from "./components/DataFilters/DataFilters";
import StartupLoader from "./components/StartupLoader/StartupLoader";
import DataPrintSelection from "./components/DataPrintSelection/DataPrintSelection";
import ProductionPrintCard from "./components/ProductionPrintCard/ProductionPrintCard";
import AlertsHost from "./components/AlertsHost/AlertsHost";

const App = () => {
  const refreshFiles = useStore((state) => state.refreshFiles);
  const [isLoading, setIsLoading] = useState(true);

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
          <ProductionPrintCard />
          <DataFilters />
          <DataList />
          <DataPrintSelection />
        </>
      )}
    </div>
  );
};

export default App;
