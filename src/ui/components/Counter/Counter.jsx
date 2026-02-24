import styles from './Counter.module.css';

const Counter = ()=>{
    return (
        <div className={styles.counter_container}>
            <div className={styles.progress_container}>
                <div className={styles.counter_progress}></div>
            </div>
        </div>
    )
}

export default Counter;