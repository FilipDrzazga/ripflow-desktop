import { useEffect } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";

const App = () => {
  const store = useStore();
  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const res = await window.api.readFolders();
        if (!res.ok) return;
        store.setFiles(res.data);
        console.log(res.data);
      } catch (err) {
        console.log(err.message);
      }
    };
    fetchFolders();
  }, []);
  return (
    <div className={styles.app}>
      <DataList />
    </div>
  );
};

export default App;
