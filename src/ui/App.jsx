import "./styles/global.css";
import styles from "./App.module.css";
import DataTable from "./components/Table/DataTable";
import Sidebar from "./components/Sidebar/Sidebar";

const App = () => {
  return (
    <div className={styles.app}>
      <Sidebar />
      <DataTable />
    </div>
  );
};

export default App;
