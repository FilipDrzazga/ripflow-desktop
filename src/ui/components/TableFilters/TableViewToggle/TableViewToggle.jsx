import { useState } from "react";
import { Button } from "@chakra-ui/react";
import styles from "./TableViewToggle.module.css";

const TableViewToggle = () => {
  const [isBtnActive, setIsBtnActive] = useState("All");

  const handleButtonClick = (e) => {
    const buttonText = e.currentTarget.textContent;
    setIsBtnActive(buttonText);
  };
  return (
    <div className={styles.container}>
      <Button
        className={`${isBtnActive === "All" ? styles.all_btn_active : styles.all_btn}`}
        variant="outline"
        size="md"
        onClick={handleButtonClick}
      >
        All
      </Button>
      <Button
        className={`${isBtnActive === "Error List" ? styles.error_btn_active : styles.error_btn}`}
        variant="outline"
        size="md"
        onClick={handleButtonClick}
      >
        Error List
      </Button>
    </div>
  );
};

export default TableViewToggle;
