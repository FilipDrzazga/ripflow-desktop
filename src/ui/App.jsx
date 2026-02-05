import "./styles/global.css";
import styles from "./App.module.css";
import RipflowTable from "./components/Table/RipflowTable";
import Sidebar from "./components/Sidebar/Sidebar";

const App = () => {
  return (
    <div className={styles.app}>
      <Sidebar />
      <RipflowTable />
    </div>
  );
};

export default App;
