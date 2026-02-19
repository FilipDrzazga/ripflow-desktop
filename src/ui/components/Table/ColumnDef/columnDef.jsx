import { createColumnHelper } from "@tanstack/react-table";
import { Badge, Button, Checkbox } from "@chakra-ui/react";
import { TiArrowSortedDown, TiArrowSortedUp } from "react-icons/ti";
import styles from "../DataTable/DataTable.module.css";
 
const columnHelper = createColumnHelper();
 const columnDef = [
  columnHelper.display({
    id: "select",
    header: () => <Checkbox.Root style={{visibility:'hidden'}} ><Checkbox.HiddenInput /><Checkbox.Control /></Checkbox.Root>,
    size: 40,
    minSize: 40,
    maxSize: 40,
    cell: ({ row }) => {
      if (row.getIsGrouped()) {
        const leafRows = row.getLeafRows();
        const allSelected = leafRows.length > 0 && leafRows.every((r) => r.getIsSelected());
        const someSelected = leafRows.some((r) => r.getIsSelected());

        const groupChecked = allSelected ? true : someSelected ? "indeterminate" : false;
        return (
          <Checkbox.Root
            variant='outline'
            checked={groupChecked}
            onCheckedChange={() => {
              leafRows.forEach((r) => r.toggleSelected(!allSelected));
            }}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
        );
      }
      return (
        <Checkbox.Root checked={row.getIsSelected()} onCheckedChange={(e) => row.toggleSelected(!!e.checked)}>
          <Checkbox.HiddenInput />
          <Checkbox.Control />
        </Checkbox.Root>
      );
    },
  }),
  columnHelper.accessor("printFolder", {
    header: "Folder Name",
    cell: () => null,
    enableHiding: true,
  }),
  columnHelper.accessor((row) => row.file.name, {
    id: "fileName",
    header: "File Name",
    cell: (info) => {
      const row = info.row;
      if(row.getIsGrouped()) {
        return (
          <Button className={styles.table_expanded_btn} variant="ghost" size="sm" cursor='default'>
            <Badge className={styles.badge} variant="solid" size="sm">
              {row.subRows.length}
              {row.getIsExpanded() ? <TiArrowSortedDown /> : <TiArrowSortedUp />}
            </Badge>
            {row.groupingColumn?.columnDef.header}
            {row.groupingValue}
          </Button>
        )
      }
      return info.getValue();
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell:(info)=>{
      const row = info.row;
      if(row.getIsGrouped()) return null;
      return <Badge colorPalette={info.getValue() === "OK" ? "green" : "red"}>{info.getValue()}</Badge>;
    },
    size:80,
    minSize:80,
    maxSize:80,
  }),
];

export default columnDef;