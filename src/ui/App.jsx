import "./styles/global.css";
import styles from "./App.module.css";
import Table from "./components/Table/Table";
import Sidebar from "./components/Sidebar/Sidebar";

const App = () => {
  return (
    <div className={styles.app}>
      <Sidebar />
      <Table />
    </div>
  );
};

export default App;
