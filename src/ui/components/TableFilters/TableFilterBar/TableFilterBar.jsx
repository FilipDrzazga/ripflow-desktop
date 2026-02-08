import { Input, InputGroup, ButtonGroup, Button, IconButton } from "@chakra-ui/react";
import { TbFileSearch } from "react-icons/tb";
import styles from "./TableFilterBar.module.css";

const TableFilterBar = () => {
  return (
    <>
      <InputGroup startElement={<TbFileSearch />}>
        <Input className={styles.filterbar} placeholder="..." size="md" variant="outline" />
      </InputGroup>
      <ButtonGroup size="sm" variant="outline" attached>
        <Button variant="outline">Button</Button>
        <IconButton variant="outline">
          <TbFileSearch />
        </IconButton>
      </ButtonGroup>
    </>
  );
};

export default TableFilterBar;
