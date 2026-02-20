import { createColumnHelper } from "@tanstack/react-table";
import { classifyMaterial } from "../../../config/materialGroups";
import { Badge, Button, Checkbox, Tooltip  } from "@chakra-ui/react";
import { TiArrowSortedDown, TiArrowSortedUp } from "react-icons/ti";
import styles from "../DataTable/DataTable.module.css";
 
const columnHelper = createColumnHelper();
 const columnDef = [
columnHelper.display({
  id: "select",
  header: () => (
    <Checkbox.Root style={{ visibility: "hidden" }}>
      <Checkbox.HiddenInput />
      <Checkbox.Control />
    </Checkbox.Root>
  ),
  size: 40,
  minSize: 40,
  maxSize: 40,

  cell: ({ row }) => {
    // -------------------------
    // GROUP ROW
    // -------------------------
    if (row.getIsGrouped()) {
      const leafRows = row.getLeafRows();
      const selectable = leafRows.filter((r) => r.getCanSelect());

      if (selectable.length === 0) {
        return (
          <Checkbox.Root disabled checked={false}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
        );
      }

      const allSelected = selectable.every((r) => r.getIsSelected());
      const someSelected = selectable.some((r) => r.getIsSelected());
      const groupChecked = allSelected ? true : someSelected ? "indeterminate" : false;

      return (
        <Checkbox.Root
          variant="outline"
          checked={groupChecked}
          onCheckedChange={(e) => {
            const next = e.checked === true;
            selectable.forEach((r) => r.toggleSelected(next));
          }}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
        </Checkbox.Root>
      );
    }

    // -------------------------
    // LEAF ROW
    // -------------------------
    const canSelect = row.getCanSelect();
    const r = row.original;

    let tooltipMsg = "";

    if (r?.status !== "OK") {
      tooltipMsg = "This file failed parsing and cannot be sent to print.";
    } else {
      const g = classifyMaterial(r?.material);
      if (g === "unknown") {
        tooltipMsg = "Unknown material cannot be selected.";
      } else {
        tooltipMsg = "You cannot mix cotton and polyester in one batch.";
      }
    }

    const checkbox = (
      <Checkbox.Root
        checked={row.getIsSelected()}
        disabled={!canSelect}
        onCheckedChange={(e) => {
          if (!canSelect) return;
          row.toggleSelected(e.checked === true);
        }}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
      </Checkbox.Root>
    );

    if (!canSelect) {
      return (
        <Tooltip.Root openDelay={250}>
          <Tooltip.Trigger asChild>
            <span style={{ display: "inline-flex" }}>{checkbox}</span>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {tooltipMsg}
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      );
    }

    return checkbox;
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
   columnHelper.accessor("material", {
  id: "material",
  header: 'Material',
    size: 20,
    minSize: 20,
    maxSize: 20,
  enableColumnFilter: true,
  cell: (info) => {
    if (info.row.getIsGrouped()) return null;
    if (info.cell.getIsPlaceholder?.() || info.cell.getIsAggregated?.()) return null;

    const material = info.getValue();
    const group = classifyMaterial(material);

    let colorPalette = "gray";
    let label = "Unknown";

    if (group === "cotton") {
      colorPalette = "purple";
      label = "Cotton";
    } else if (group === "polyester") {
      colorPalette = "yellow";
      label = "Polyester";
    }

    return (
      <Badge colorPalette={colorPalette} variant="subtle">
        {label}
      </Badge>
    );
  },

  filterFn: (row, columnId, filterValue) => {
    if (!filterValue || filterValue === "all") return true;

    const group = classifyMaterial(row.getValue(columnId));

    if (filterValue === "cotton") return group === "cotton";
    if (filterValue === "polyester") return group === "polyester";
    return true;
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