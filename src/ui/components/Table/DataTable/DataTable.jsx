import { useState } from "react";
import { useStore } from '../../../store/useStore';
import columnDef from "../ColumnDef/columnDef";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  getGroupedRowModel,
  getExpandedRowModel,
} from "@tanstack/react-table";
import { Table } from "@chakra-ui/react";
import SelectionActionBar from "../SelectionActionBar/SelectionActionBar";
import styles from "./DataTable.module.css";

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

  const selectedCount = table.getSelectedRowModel().flatRows.length;

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
      <SelectionActionBar table={table} selectedCount={selectedCount} />
    </div>
  );
};

export default DataTable;
