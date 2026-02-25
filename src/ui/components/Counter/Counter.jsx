import { useEffect} from 'react';
import styles from './Counter.module.css';

const Counter = ({ diffDays, children })=>{
    const MAX_DAYS = 3;
    const MIN_VISIBLE = 5;

    const PROGRESS_COLORS = [
        '#86efac',
        '#facc15',
        '#f87171'
    ];

    const fillCounterBar = () => {
        const dayPassed =  Math.max(diffDays -1);   
        const baseProgressPercent = Math.min((dayPassed / MAX_DAYS) * 100, 100);
        const visibleProgressPercent =  diffDays >= 1 ? Math.max(baseProgressPercent, MIN_VISIBLE) : 0;
        
        let color = PROGRESS_COLORS[0];
         if(visibleProgressPercent >= 32) color = PROGRESS_COLORS[1];
         if(visibleProgressPercent >= 67) color = PROGRESS_COLORS[2];
       
         return {
            width: `${visibleProgressPercent}%`,
            backgroundColor: color,
            boxShadow:`0 2px 6px ${color}30, 0 4px 16px ${color}25`
         }
    }

    useEffect(()=>{
        fillCounterBar();
    }, [diffDays])

    return (
        <div className={styles.counter_container}>
            {children}
            <div className={styles.counter_track}>
                <div className={styles.counter_fill} style={fillCounterBar()}></div>
            </div>
        </div>
    )
}

export default Counter;