import { useState, useEffect } from "react";
import { useStore } from "../../../store/useStore";
import columnDef from "../ColumnDef/columnDef";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  getGroupedRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { Table } from "@chakra-ui/react";
import TableSelectionBar from "../TableSelectionBar/TableSelectionBar";
import styles from "./DataTable.module.css";
import TableRefreshBtn from "../TableRefreshBtn/TableRefreshBtn";
import TableToggleView from "../TableToggleView/TableToggleView";
import { classifyMaterial } from "../../../config/materialGroups";

const DataTable = () => {
  const [grouping, setGrouping] = useState(["printFolder"]);
  const [selectionGroup, setSelectionGroup] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({
    printFolder: false,
  });

  const table = useReactTable({
    data: useStore((state) => state.files) || [],
    columns: columnDef,
    state: {
      columnVisibility: columnVisibility,
      grouping: grouping,
      expanded: true,
      rowSelection: rowSelection,
      columnFilters: columnFilters,
    },
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: (row) => {
      if (row.getIsGrouped?.() || row.getIsPlaceholder?.()) return false;

      const r = row.original;
      if (!r) return false;
      if (r.status !== "OK") return false;
      const g = classifyMaterial(r.material);
      if (g === "unknown") return false;
      if (!selectionGroup) return true;

      return g === selectionGroup;
    },
    getRowId: (row) => row.file?.fullPath || `${row.printFolder}/${row.file?.name}`,
  });

  const selectedCount = table.getSelectedRowModel().flatRows.length;

  useEffect(() => {
    const selected = table.getSelectedRowModel().flatRows;

    if (selected.length === 0) {
      setSelectionGroup(null);
      return;
    }

    const material = selected[0].original?.material;
    const firstGroup = classifyMaterial(material);

    if (firstGroup === "cotton" || firstGroup === "polyester") {
      setSelectionGroup(firstGroup);
    } else {
      setSelectionGroup(null);
    }
  }, [table.getState().rowSelection]);

  return (
    <>
      <div className={styles.table_modulers}>
        <TableToggleView
          value={columnFilters.find((f) => f.id === "material")?.value || "all"}
          onChange={(value) => setColumnFilters([{ id: "material", value }])}
        />
        <TableRefreshBtn />
      </div>
      <div className={styles.table_container}>
        <Table.ScrollArea height="100%">
          <Table.Root size="sm" variant="simple" interactive showColumnBorder={false} native>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      className={styles.table_header}
                      key={header.id}
                      style={{
                        width: header.getSize(),
                        textAlign: header.column.id === "status" || header.column.id === "material" ? "center" : "left",
                      }}
                    >
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
                      <td
                        className={styles.table_cell}
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          textAlign: cell.column.id === "status" || cell.column.id === "material" ? "center" : "left",
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </Table.Root>
        </Table.ScrollArea>
        <TableSelectionBar table={table} selectedCount={selectedCount} selectedGroup={selectionGroup} />
      </div>
    </>
  );
};

export default DataTable;
