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
import { Table, Badge, Button } from "@chakra-ui/react";
import { TiArrowSortedDown, TiArrowSortedUp } from "react-icons/ti";
import styles from "./DataTable.module.css";

const columnHelper = createColumnHelper();
const columnDef = [
  columnHelper.accessor("printFolder", {
    header: "Folder Name",
    cell: () => null,
    enableHiding: true,
  }),
  columnHelper.accessor((row) => row.file.name, {
    header: "File Name",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <Badge colorPalette={info.getValue() === "OK" ? "green" : "red"}>{info.getValue()}</Badge>,
  }),
];

const DataTable = () => {
  const [columnVisibility, setColumnVisibility] = useState({
    printFolder: false,
  });
  const [grouping, setGrouping] = useState(["printFolder"]);
  const [expanded, setExpanded] = useState(true);

  const table = useReactTable({
    data: useStore((state) => state.folders) || [],
    columns: columnDef,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,
    state: {
      columnVisibility: columnVisibility,
      grouping: grouping,
      expanded: expanded,
    },
    onColumnVisibilityChange: setColumnVisibility,
  });

  useEffect(() => {
    const getFolders = async () => {
      const res = await window.api.readFolder();
      if (!res) return;
      useStore.setState({ folders: res });
    };
    getFolders();
  }, []);

  return (
    <div className={styles.table_container}>
      <Table.ScrollArea height="100%">
        <Table.Root
          size="sm"
          variant="simple"
          interactive
          stickyHeader
          showColumnBorder={false}
          overflow="hidden"
          height="100%"
          native
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className={styles.table_header} key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              if (row.getIsGrouped()) {
                return (
                  <tr className={styles.table_row} key={row.id}>
                    <td className={styles.table_cell} key={row.id} colSpan={table.getAllLeafColumns().length}>
                      <Button className={styles.table_expanded_btn} onClick={row.getToggleExpandedHandler()}>
                        <Badge className={styles.badge} variant="solid" size="sm">
                          {row.subRows.length}
                          {row.getIsExpanded() ? <TiArrowSortedDown /> : <TiArrowSortedUp />}
                        </Badge>
                        {row.groupingColumn?.columnDef.header}
                        {row.groupingValue}
                      </Button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr className={styles.table_row} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className={styles.table_cell} key={cell.id}>
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
