import { LuMinus, LuX } from "react-icons/lu";
import { minimizeWindow, closeWindow } from "../../services/systemService";
import styles from "./TitleBar.module.css";
import maakeLogo from "@/assets/image/Maake_Logo.webp";

const TitleBar = () => {
  return (
    <div className={styles.titlebar}>
      <div className={styles.logo_col}>
        <img src={maakeLogo} alt="Maake" className={styles.logo} draggable={false} />
      </div>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={minimizeWindow}>
          <LuMinus size={14} />
        </button>
        <button className={`${styles.btn} ${styles.close}`} onClick={closeWindow}>
          <LuX size={14} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
