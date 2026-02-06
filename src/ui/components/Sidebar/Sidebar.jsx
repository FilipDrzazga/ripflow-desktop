import { useState } from "react";
import { Button } from "@chakra-ui/react";
import styles from "./Sidebar.module.css";
import logo from "../../assets/image/Maake_Logo.webp";

import { BsPrinterFill } from "react-icons/bs";
import { IoIosAnalytics } from "react-icons/io";
import { IoSettingsSharp } from "react-icons/io5";

const Sidebar = () => {
  const [isBtnActive, setIsBtnActive] = useState('Ripboard');

  const handleButtonClick = (e) => {
    const buttonText = e.currentTarget.textContent;
    setIsBtnActive(buttonText);
  }
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
      <div  className={styles.divider}></div>
      <div className={styles.menu}>
        <div className={styles.menu_item}>
          <Button onClick={handleButtonClick} className={isBtnActive === 'Ripboard' ? styles.menu_button_active : styles.menu_button}>
            <BsPrinterFill />
            Ripboard
          </Button>
        </div>
        <div className={styles.menu_item}>
          <Button onClick={handleButtonClick} className={isBtnActive === 'Analytics' ? styles.menu_button_active  : styles.menu_button}>
            <IoIosAnalytics />
            Analytics
          </Button>
        </div>
        <div className={styles.menu_item}>
          <Button onClick={handleButtonClick} className={isBtnActive === 'Settings' ? styles.menu_button_active : styles.menu_button}>
            <IoSettingsSharp />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
