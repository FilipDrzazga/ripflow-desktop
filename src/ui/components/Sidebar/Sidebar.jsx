import styles from "./Sidebar.module.css";
import logo from "../../assets/image/Maake_Logo.webp";

const Sidebar = () => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.header_logoContainer}>
          <img className={styles.header_logo} src={logo} alt="Maake Logo" />
        </div>
        <div className={styles.header_textContainer}>
          <h1 className={styles.header_title}>Ripflow</h1>
          <p className={styles.header_subtitle}>Maake Automation easy</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
