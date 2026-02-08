import DataTable from "../DataTable/DataTable";
import TableFilters from "../TableFilters/TableFilters";
import styles from "./Table.module.css";

const Table = () => {
  return (
    <div className={styles.container}>
      <TableFilters />
      <DataTable />
    </div>
  );
};

export default Table;
