import { useState } from "react";
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

const DATA = [
  {
    orderID: "ON311123",
    customerID: "Stella Petrie",
    itemIndex: "1/3",
    fabricName: "Eco Silk Twill",
    qty: "2",
    unit: "LM",
    size: "1000x1420",
    status: "Failed",
  },
  {
    orderID: "ON311123",
    customerID: "Stella Petrie",
    itemIndex: "2/3",
    fabricName: "Eco Silk Twill",
    qty: "4",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311123",
    customerID: "Stella Petrie",
    itemIndex: "3/3",
    fabricName: "Eco Silk Twill",
    qty: "1",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311124",
    customerID: "John Doe",
    itemIndex: "1/2",
    fabricName: "Upholstery Velvet",
    qty: "3",
    unit: "FQ",
    size: "670x480",
    status: "Ready",
  },
  {
    orderID: "ON311124",
    customerID: "John Doe",
    itemIndex: "2/2",
    fabricName: "Upholstery Velvet",
    qty: "5",
    unit: "FQ",
    size: "670x480",
    status: "Ready",
  },
  {
    orderID: "ON311125",
    customerID: "Alice Smith",
    itemIndex: "1/1",
    fabricName: "Velvet Plush",
    qty: "1",
    unit: "S",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311126",
    customerID: "Bob Johnson",
    itemIndex: "1/2",
    fabricName: "Waterproof Canvas",
    qty: "2",
    unit: "CSC",
    size: "450x450",
    status: "Ready",
  },
  {
    orderID: "ON311126",
    customerID: "Bob Johnson",
    itemIndex: "2/2",
    fabricName: "Waterproof Canvas",
    qty: "3",
    unit: "CSC",
    size: "450x450",
    status: "Ready",
  },
  {
    orderID: "ON311127",
    customerID: "Charlie Brown",
    itemIndex: "1/1",
    fabricName: "Linen Blend",
    qty: "4",
    unit: "LM",
    size: "1000x1420",
    status: "Failed",
  },
  {
    orderID: "ON311128",
    customerID: "Diana Prince",
    itemIndex: "1/1",
    fabricName: "Silk Satin",
    qty: "2",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311129",
    customerID: "Ethan Hunt",
    itemIndex: "1/3",
    fabricName: "Microfiber",
    qty: "3",
    unit: "FQ",
    size: "670x480",
    status: "Ready",
  },
  {
    orderID: "ON311129",
    customerID: "Ethan Hunt",
    itemIndex: "2/3",
    fabricName: "Microfiber",
    qty: "2",
    unit: "FQ",
    size: "670x480",
    status: "Ready",
  },
  {
    orderID: "ON311129",
    customerID: "Ethan Hunt",
    itemIndex: "3/3",
    fabricName: "Microfiber",
    qty: "1",
    unit: "FQ",
    size: "670x480",
    status: "Failed",
  },
  {
    orderID: "ON311130",
    customerID: "Fiona Gallagher",
    itemIndex: "1/1",
    fabricName: "Denim",
    qty: "5",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311131",
    customerID: "George Michael",
    itemIndex: "1/2",
    fabricName: "Corduroy",
    qty: "2",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
  {
    orderID: "ON311131",
    customerID: "George Michael",
    itemIndex: "2/2",
    fabricName: "Corduroy",
    qty: "3",
    unit: "LM",
    size: "1000x1420",
    status: "Ready",
  },
];

const columnHelper = createColumnHelper();
const columnDef = [
  columnHelper.accessor("orderID", {
    header: "Order ID",
    cell: (info) => info.getValue(),
    id: "orderID",
  }),
  columnHelper.accessor("customerID", {
    header: "Customer ID",
    cell: (info) => info.getValue(),
    id: "customerID",
  }),
  columnHelper.accessor("itemIndex", {
    header: "Item Index",
    cell: (info) => info.getValue(),
    id: "itemIndex",
  }),
  columnHelper.accessor("fabricName", {
    header: "Fabric Name",
    cell: (info) => info.getValue(),
    id: "fabricName",
  }),
  columnHelper.accessor("qty", {
    header: "Quantity",
    cell: (info) => info.getValue(),
    id: "qty",
  }),
  columnHelper.accessor("unit", {
    header: "Unit",
    cell: (info) => info.getValue(),
    id: "unit",
  }),
  columnHelper.accessor("size", {
    header: "Size",
    cell: (info) => info.getValue(),
    id: "size",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const colorPalette = status === "Ready" ? "green" : "red";
      return <Badge colorPalette={colorPalette}>{status}</Badge>;
    },
    id: "status",
  }),
];

const DataTable = () => {
  const [grouping, setGrouping] = useState(["fabricName"]);
  const [expanded, setExpanded] = useState(true);

  const table = useReactTable({
    data: DATA,
    columns: columnDef,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,
    state: {
      grouping: grouping,
      expanded: expanded,
    },
  });

  // console.log(table);

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
            {/* {table.getRowModel().rows.map((row) => (
              <tr className={styles.table_row} key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td className={styles.table_cell} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))} */}
          </tbody>
        </Table.Root>
      </Table.ScrollArea>
    </div>
  );
};

export default DataTable;
