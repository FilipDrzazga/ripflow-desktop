import { Input, InputGroup } from "@chakra-ui/react";
import { BiSearchAlt2 } from "react-icons/bi";
import styles from "./TableFilterBar.module.css";

const TableFilterBar = () => {
  return (
    <div className={styles.container}>
      <InputGroup w='auto' startElement={<BiSearchAlt2 size={20} color="var(--text-secondary)" />}>
        <Input className={styles.filterbar} placeholder="Search..." size="md" />
      </InputGroup>
    </div>
  );
};

export default TableFilterBar;
