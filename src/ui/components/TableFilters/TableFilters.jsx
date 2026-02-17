import TableFilterBar from "./TableFilterBar/TableFilterBar";
import TableViewToggle from "./TableViewToggle/TableViewToggle";
import TableRefresh from "./TableRefresh/TableRefresh";
import styles from "./TableFilters.module.css";

const TableFilters = () => {
  return (
    <div className={styles.container}>
      {/* <TableFilterBar /> */}
      {/* <TableViewToggle /> */}
      <TableRefresh />
    </div>
  );
};

export default TableFilters;
