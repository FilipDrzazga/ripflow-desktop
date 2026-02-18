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
    header: null,
    cell: ({ row }) => {
      console.log(row.getIsGrouped());
      if (row.getIsGrouped()) {
        const leafRows = row.getLeafRows();
        const allSelected = leafRows.length > 0 && leafRows.every((r) => r.getIsSelected());
        const someSelected = leafRows.some((r) => r.getIsSelected());
        return (
          <Checkbox.Root
            checked={allSelected}
            indeterminate={!allSelected && someSelected ? true : undefined}
            onCheckedChange={(e) => {
              const next = !!e.checked;
              leafRows.forEach((r) => r.toggleSelected(next));
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
    header: "File Name",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <Badge colorPalette={info.getValue() === "OK" ? "green" : "red"}>{info.getValue()}</Badge>,
  }),
];

const DataTable = () => {
  const [grouping, setGrouping] = useState(["printFolder"]);
  const [expanded, setExpanded] = useState({});
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
      expanded: expanded,
      rowSelection: rowSelection,
    },
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.file?.path || `${row.printFolder}-${row.file?.name}`,
  });

  useEffect(() => {
    const getFolders = async () => {
      const res = await window.api.readFolder();
      if (!res) return;
      useStore.setState({ folders: res });
      console.log(res);
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
