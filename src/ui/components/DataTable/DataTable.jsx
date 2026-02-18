import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  useReactTable,
  createColumnHelper,
  getCoreRowModel,
  flexRender,
  getGroupedRowModel,
  getExpandedRowModel,
} from "@tanstack/react-table";
import { Table, Badge, Button, Checkbox } from "@chakra-ui/react";
import { TiArrowSortedDown, TiArrowSortedUp } from "react-icons/ti";
import styles from "./DataTable.module.css";

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
            onCheckedChange={(e) => {
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

const DataTable = () => {
  const [grouping, setGrouping] = useState(["printFolder"]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState({
    printFolder: false,
  });

  const table = useReactTable({
    data: useStore((state) => state.folders) || [],
    columns: columnDef,
    state: {
      columnVisibility: columnVisibility,
      grouping: grouping,
      expanded: true,
      rowSelection: rowSelection,
    },
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.file?.fullPath || `${row.printFolder}/${row.file?.name}`,
  });

  useEffect(() => {
    const getFolders = async () => {
      const res = await window.api.readFolder();
      if (!res) return;
      useStore.setState({ folders: res });
    };
    getFolders();
  }, []);

  useEffect(() => {
    console.log("ROW SELECTION:", rowSelection);
  }, [rowSelection]);

  return (
    <div className={styles.table_container}>
      <Table.ScrollArea height="100%">
        <Table.Root
          size="sm"
          variant="simple"
          interactive
          showColumnBorder={false}
          overflow="hidden"
          native
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className={styles.table_header} key={header.id} style={{ width: header.getSize(), textAlign: header.column.id === "status" ? "center" : "left" }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              return (
                <tr className={styles.table_row} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className={styles.table_cell} key={cell.id} style={{ width: cell.column.getSize(), textAlign: cell.column.id === "status" ? "center" : "left" }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table.Root>
      </Table.ScrollArea>
    </div>
  );
};

export default DataTable;
