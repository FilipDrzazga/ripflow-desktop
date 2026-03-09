import { useState, useEffect } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";
import DataFilters from "./components/DataFilters/DataFilters";
import StartupLoader from "./components/StartupLoader/StartupLoader";
import DataPrintSelection from "./components/DataPrintSelection/DataPrintSelection";
import AlertsHost from "./components/AlertsHost/AlertsHost";

const App = () => {
  const store = useStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const res = await window.api.readFolders();
        if (!res.success) return;
        store.setFiles(res.data);
        store.setFilteredFiles(res.data);
      } catch (err) {
        // console.log(err.message);
      }
    };
    fetchFolders();
  }, []);
  return (
    <div className={styles.app}>
      <AlertsHost />
      {isLoading && <StartupLoader onDone={() => setIsLoading(false)} />}
      {!isLoading && (
        <>
          <DataFilters />
          <DataList />
          <DataPrintSelection />
        </>
      )}
    </div>
  );
};

export default App;
