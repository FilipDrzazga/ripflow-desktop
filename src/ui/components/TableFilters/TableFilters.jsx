import TableFilterBar from "./TableFilterBar/TableFilterBar";
import styles from './TableFilters.module.css';

const TableFilters = () => {
    return (
        <div className={styles.container}>
            <TableFilterBar />
        </div>
    )
};

export default TableFilters;