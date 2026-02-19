import DataTable from "./DataTable/DataTable";
import styles from "./Table.module.css";

const Table = () => {
  return (
    <div className={styles.container}>
      <DataTable />
    </div>
  );
};

export default Table;
