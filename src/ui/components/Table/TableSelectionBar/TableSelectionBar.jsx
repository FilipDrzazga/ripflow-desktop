import { useState, useEffect, useRef } from "react";
import { LuShare, LuTrash2 } from "react-icons/lu";
import { Button, ActionBar, RadioGroup } from "@chakra-ui/react";

const TableSelectionBar = ({ table, selectedCount, selectedGroup }) => {
  const open = selectedCount > 0;
  if (!open) return null;
  const [radioValue, setRadioValue] = useState("undefined");
  const printerName = useRef(null);
  const polyPrintersArr = [
    { name: "YUMI", value: "YUMI" },
    { name: "YOKO", value: "YOKO" },
  ];
  const cottonPrintersArr = [{ name: "DGEN", value: "DGEN" }];

  const handleRadioChange = (e) => {
    setRadioValue(e.value);
    printerName.current = e.value;
  };

  const handleClearSelection = () => {
    table.resetRowSelection();
    setRadioValue("undefined");
    printerName.current = null;
  };

  const handleSelectItems = async () => {
    try {
      const selected = table.getSelectedRowModel().flatRows.map((r) => r.original);

      const payload = {
        printer: printerName.current,
        materialGroup: selectedGroup,
        files: selected.map((f) => ({
          id: f.id,
          fileName: f.file?.name,
          sourcePath: f.file?.fullPath,
          printFolder: f.printFolder,
          material: f.material,
          orderId: f.orderId,
          printType: f.printType,
          qty: f.qty,
          size: f.size,
          status: f.status,
        })),
      };

      const res = await window.api.createBatch(payload);

      if (!res?.ok) {
        console.error("createBatch failed:", res);
        // TODO: show error to user
        return;
      }

      console.log("Batch created:", res.batchId, res.batchRoot);
      table.resetRowSelection();
      // refresh list...
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!open) {
      setRadioValue("undefined");
    }
  }, [open]);

  return (
    <ActionBar.Root open={open} closeOnInteractOutside={false}>
      <ActionBar.Positioner>
        <ActionBar.Content>
          <span
            style={{
              width: "auto",
              height: "34px",
              border: "1px dashed var(--border-default)",
              borderRadius: "4px",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              fontSize: "14px",
            }}
          >
            {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
          </span>
          <ActionBar.Separator />
          <RadioGroup.Root
            variant="subtle"
            size="sm"
            value={radioValue}
            onValueChange={handleRadioChange}
            style={{ display: "flex", gap: "10px" }}
          >
            {selectedGroup === "polyester"
              ? polyPrintersArr.map((printer) => {
                  return (
                    <RadioGroup.Item key={printer.value} value={printer.value}>
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemIndicator />
                      <RadioGroup.ItemText>{printer.name}</RadioGroup.ItemText>
                    </RadioGroup.Item>
                  );
                })
              : selectedGroup === "cotton"
                ? cottonPrintersArr.map((printer) => {
                    return (
                      <RadioGroup.Item key={printer.value} value={printer.value}>
                        <RadioGroup.ItemHiddenInput />
                        <RadioGroup.ItemIndicator />
                        <RadioGroup.ItemText>{printer.name}</RadioGroup.ItemText>
                      </RadioGroup.Item>
                    );
                  })
                : null}
          </RadioGroup.Root>
          <ActionBar.Separator />
          <Button
            size="sm"
            variant="solid"
            bg="var(--accent-emerald)"
            color="var(--text-inverse)"
            onClick={handleSelectItems}
          >
            <LuShare />
            Rip
          </Button>
          <Button size="sm" variant="solid" bg="red.500" color="var(--text-inverse)" onClick={handleClearSelection}>
            <LuTrash2 />
            Clear Selection
          </Button>
        </ActionBar.Content>
      </ActionBar.Positioner>
    </ActionBar.Root>
  );
};

export default TableSelectionBar;
