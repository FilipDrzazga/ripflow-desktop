import { IoWarningOutline } from "react-icons/io5";
import style from "./AlertsHost.module.css";

const AlertsHost = () => {
    return (
    <div className={style.alerts_container}>
        <div className={style.alerts_content}>
            <div><IoWarningOutline /></div>
            <div>
                <div>Alert Title</div>
                <div>alert description</div>
            </div>
        </div>
    </div>
    )
}

export default AlertsHost;