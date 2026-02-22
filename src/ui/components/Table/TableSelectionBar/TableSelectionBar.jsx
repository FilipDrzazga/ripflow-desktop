import { useState, useEffect, useRef } from "react";
import { useStore } from "../../../store/useStore";
import { LuShare, LuTrash2 } from "react-icons/lu";
import { Button, ActionBar, RadioGroup } from "@chakra-ui/react";
import { notifyBatchError, notifyBatchWarning, notifyBatchSuccess } from "../../ErrorBatchHandler/ErrorBatchHandler";

const TableSelectionBar = ({ table, selectedCount, selectedGroup, startRemoveAnimation }) => {
  const removeFilesByIds = useStore((s) => s.removeFilesByIds);
  const open = selectedCount > 0;

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

      if (!selected.length) {
        notifyBatchWarning("No files selected.", "Please select at least one file.");
        return;
      }

      if (!printerName.current) {
        notifyBatchWarning("Printer not selected.", "Please select a printer.");
        return;
      }

      const missing = selected.filter((f) => !(f.file?.fullPath || f.sourcePath || f.printFilePath));
      if (missing.length) {
        notifyBatchWarning("Missing source path.", `Problematic files: ${missing.length}`);
        return;
      }

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

      const createBatchResponse = await window.api.createBatch(payload);

      if (!createBatchResponse?.ok) {
        console.error("createBatch failed:", createBatchResponse);
        notifyBatchError(createBatchResponse);
        return;
      }

      table.resetRowSelection();
      setRadioValue("undefined");
      printerName.current = null;
      // notifyBatchSuccess("Batch created.", createBatchResponse.batchId);

      const movedIds = (createBatchResponse.movedIds ?? []).filter(Boolean);
      if (movedIds.length) {
        // 1) animacja
        startRemoveAnimation(movedIds, 1000);

        // 2) faktyczne usunięcie po czasie animacji
        setTimeout(() => {
          removeFilesByIds(movedIds);
        }, 1000);
        notifyBatchSuccess(
          "Batch created and list refreshed.",
          `${createBatchResponse.batchId} • Removed ${movedIds.length} items`,
        );
      }
    } catch (err) {
      console.error(err);
      notifyBatchError({ code: "UI_UNKNOWN", userMessage: "Unexpected UI error." });
    }
  };

  useEffect(() => {
    if (!open) {
      setRadioValue("undefined");
      printerName.current = null;
    }
  }, [open]);

  if (!open) return null;

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
              ? polyPrintersArr.map((printer) => (
                  <RadioGroup.Item key={printer.value} value={printer.value}>
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator />
                    <RadioGroup.ItemText>{printer.name}</RadioGroup.ItemText>
                  </RadioGroup.Item>
                ))
              : selectedGroup === "cotton"
                ? cottonPrintersArr.map((printer) => (
                    <RadioGroup.Item key={printer.value} value={printer.value}>
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemIndicator />
                      <RadioGroup.ItemText>{printer.name}</RadioGroup.ItemText>
                    </RadioGroup.Item>
                  ))
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
