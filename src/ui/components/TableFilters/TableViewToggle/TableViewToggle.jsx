import {useState} from "react";
import { Button } from "@chakra-ui/react";
import styles from "./TableViewToggle.module.css";

const TableViewToggle = () => {
    const [isBtnActive, setIsBtnActive] = useState('Single');

    const handleButtonClick = (e) => {
    const buttonText = e.currentTarget.textContent;
    setIsBtnActive(buttonText);
  }
  return (
    <div className={styles.container}>
        <Button className={`${isBtnActive === 'Single' ? styles.single_btn_active : styles.single_btn}`} variant='outline' size='md' onClick={handleButtonClick}>Single</Button>
        <Button className={`${isBtnActive === 'Batch' ? styles.batch_btn_active : styles.batch_btn}`} variant='outline' size='md' onClick={handleButtonClick}>Batch</Button>
    </div>
  )
};

export default TableViewToggle;