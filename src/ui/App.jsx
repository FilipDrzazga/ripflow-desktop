import "./styles/global.css";
import styles from "./App.module.css";
import Table from "./components/Table/Table";

const App = () => {
  return (
    <div className={styles.app}>
      <Table />
    </div>
  );
};

export default App;
