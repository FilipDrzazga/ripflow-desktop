import { useEffect } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";
import StartupLoader from "./components/StartupLoader/StartupLoader";

const App = () => {
  const store = useStore();

  useEffect(() => {
    let unsubscribe;
    const fetchFolders = async () => {
      try {
        unsubscribe = window.api.onReadFoldersProgress((payload) => {
          console.log(`${payload.label}: ${payload.percent}%`);
        });
        const res = await window.api.readFolders();
        if (!res.ok) return;
        store.setFiles(res.data);
        console.log(res.data);
      } catch (err) {
        console.log(err.message);
      }
    };
    fetchFolders();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  return (
    <div className={styles.app}>
      {/* <DataList /> */}
      <StartupLoader />
    </div>
  );
};

export default App;
