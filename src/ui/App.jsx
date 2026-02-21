import { useEffect } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import Table from "./components/Table/Table";
import { Toaster } from "@/components/Toaster/Toaster";

const App = () => {
  useEffect(() => {
    const getFolders = async () => {
      const res = await window.api.readFolder();
      if (!res) return;
      useStore.setState({ folders: res });
    };
    getFolders();
  }, []);
  return (
    <div className={styles.app}>
      <Table />
      <Toaster />
    </div>
  );
};

export default App;
