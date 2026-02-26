import styles from './DataFilters.module.css';

const DataFilters = () => {
    return(
        <div className={styles.filters_container}>
            <button className={styles.filter_button}>All</button>
            <button className={styles.filter_button}>Cottons</button>
            <button className={styles.filter_button}>Polyesters</button>
        </div>
    )
}

export default DataFilters;