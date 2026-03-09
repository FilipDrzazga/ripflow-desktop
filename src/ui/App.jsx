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
        if (res.success) {
          store.setAlert({
            id: crypto.randomUUID(),
            type: "Success",
            title: "Folders loaded",
            message: "The folder data has been successfully loaded.",
          });
          store.setFiles(res.data);
          store.setFilteredFiles(res.data);
        } else {
          const firstError = res.errors?.[0];
          store.setAlert({
            id: crypto.randomUUID(),
            type: firstError?.type || "Error",
            title: firstError?.title || "Failed to load folders",
            message: firstError?.message || "An unknown error occurred while loading folders.",
          });
        }
      } catch (err) {
        store.setAlert({
          id: crypto.randomUUID(),
          type: err?.type || "Error",
          title: err?.title || "Failed to load folders",
          message: err?.message || "An unexpected error occurred while loading folders.",
        });
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
