import TableFilterBar from "./TableFilterBar/TableFilterBar";
import TableViewToggle from "./TableViewToggle/TableViewToggle";
import styles from './TableFilters.module.css';

const TableFilters = () => {
    return (
        <div className={styles.container}>
            <TableFilterBar />
            <TableViewToggle />
        </div>
    )
};

export default TableFilters;