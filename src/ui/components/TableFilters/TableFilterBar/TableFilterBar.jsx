import { Input, InputGroup } from "@chakra-ui/react";
import { TbFileSearch } from "react-icons/tb";

const TableFilterBar = () => {
    return (
    <InputGroup startElement={<TbFileSearch />}>
      <Input placeholder="..." variant='outline' size='2xs' w='150px' h='30px'/>
    </InputGroup>
    )
}

export default TableFilterBar;