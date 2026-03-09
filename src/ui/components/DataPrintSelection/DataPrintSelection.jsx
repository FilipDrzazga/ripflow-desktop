import { useState } from "react";
import { useStore } from "../../store/useStore";
import style from "./DataPrintSelection.module.css";

const DataPrintSelection = () => {
  const printers = [
    { name: "DGEN", value: "DGEN", materialType: "Cottons" },
    { name: "YOKO", value: "YOKO", materialType: "Polyesters" },
    { name: "YUMI", value: "YUMI", materialType: "Polyesters" },
  ];
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const store = useStore();

  const isSelectionMode = store.selectedIds.size > 0;
  const selectedMaterialTypes = new Set();
  store.filteredFiles.forEach((group) => {
    group.items.forEach((item) => {
      if (store.selectedIds.has(item.id)) {
        selectedMaterialTypes.add(item.materialType);
      }
    });
  });

  const materialType = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPrinter) {
      store.setAlert({
        id: crypto.randomUUID(),
        type: "Warning",
        title: "No printer selected",
        message: "Please select a printer before submitting.",
      });
      return;
    }
    const getFilesToPrint = store.files
      .map((group) => group.items.filter((item) => store.selectedIds.has(item.id)))
      .flat();
    const print = getFilesToPrint.map((item) => ({ ...item, printer: selectedPrinter }));
    console.log(print);
    const handleCreateBatch = async () => {
      try {
        const createBatchResponse = await window.api.createBatch(print);

        if (!createBatchResponse.success) {
          const firstError = createBatchResponse.errors?.[0];
          console.log("Batch creation failed:", createBatchResponse);

          store.setAlert({
            id: crypto.randomUUID(),
            type: firstError?.type || "Error",
            title: firstError?.title || "Batch creation failed",
            message: firstError?.message || "An unknown error occurred.",
          });
          return;
        }
        console.log("Batch creation errors:", createBatchResponse);
        store.setAlert({
          id: crypto.randomUUID(),
          type: "Success",
          title: "Batch created successfully",
          message: `Batch ID: ${createBatchResponse.batchId}`,
        });
        const readFoldersResponse = await window.api.readFolders();
        if (readFoldersResponse.success) {
          store.setAlert({
            id: crypto.randomUUID(),
            type: "Success",
            title: "Folders reloaded",
            message: "The folder data has been refreshed.",
          });
          store.setFiles(readFoldersResponse.data);
          store.setFilteredFiles(readFoldersResponse.data);
        }
        store.toggleClearSelection();
        setSelectedPrinter(null);
      } catch (err) {
        store.setAlert({
          id: crypto.randomUUID(),
          type: "Error",
          title: err?.title || "Batch creation failed",
          message: err?.message || "Unexpected system error.",
        });
      }
    };
    handleCreateBatch();
  };

  const handleClearBtn = () => {
    setSelectedPrinter(null);
    store.toggleClearSelection();
  };

  return (
    <div className={`${style.selection_container} ${isSelectionMode ? style.active : ""}`}>
      <div className={style.selection_items}>
        {store.selectedIds.size > 1
          ? `${store.selectedIds.size} items selected`
          : `${store.selectedIds.size} item selected`}
      </div>
      <div className={style.separator}></div>
      <form className={style.selection_form} onSubmit={handleSubmit}>
        {printers.map((printer) => (
          <label key={printer.value} className={style.selection_label} htmlFor={printer.value}>
            <input
              className={style.selection_input}
              id={printer.value}
              name="printSelection"
              type="radio"
              value={printer.value}
              disabled={materialType !== printer.materialType}
              checked={selectedPrinter === printer.value}
              onChange={() => setSelectedPrinter(printer.value)}
            />
            {printer.name}
          </label>
        ))}
        <div className={style.separator}></div>
        <button className={style.submit_button} type="submit">
          Rip
        </button>
        <button className={style.clear_button} type="reset" onClick={handleClearBtn}>
          Clear Selection
        </button>
      </form>
    </div>
  );
};

export default DataPrintSelection;
