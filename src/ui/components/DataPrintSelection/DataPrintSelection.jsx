import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useStore } from "../../store/useStore";
import style from "./DataPrintSelection.module.css";

gsap.registerPlugin(useGSAP);

const DataPrintSelection = () => {
  const printers = [
    { name: "DGEN", value: "DGEN", materialType: "Cottons" },
    { name: "YOKO", value: "YOKO", materialType: "Polyesters" },
    { name: "YUMI", value: "YUMI", materialType: "Polyesters" },
  ];
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const files = useStore((state) => state.files);
  const filteredFiles = useStore((state) => state.filteredFiles);
  const selectedIds = useStore((state) => state.selectedIds);
  const setAlert = useStore((state) => state.setAlert);
  const clearSelection = useStore((state) => state.toggleClearSelection);
  const refreshFiles = useStore((state) => state.refreshFiles);
  const contentRef = useRef(null);

  const isSelectionMode = selectedIds.size > 0;
  const selectedMaterialTypes = new Set();
  filteredFiles.forEach((group) => {
    group.items.forEach((item) => {
      if (selectedIds.has(item.id)) {
        selectedMaterialTypes.add(item.materialType);
      }
    });
  });

  const materialType = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

  useGSAP(
    () => {
      if (!contentRef.current) return;

      const content = contentRef.current;

      gsap.killTweensOf(content);

      if (isSelectionMode) {
        gsap.set(content, {
          y: 32,
          autoAlpha: 0,
        });

        gsap.to(content, {
          y: 0,
          autoAlpha: 1,
          duration: 0.34,
          ease: "power2.out",
          overwrite: true,
        });

        return;
      }

      gsap.to(content, {
        y: 32,
        autoAlpha: 0,
        duration: 0.24,
        ease: "power2.in",
        overwrite: true,
      });
    },
    { dependencies: [isSelectionMode] },
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPrinter) {
      setAlert({
        id: crypto.randomUUID(),
        type: "Warning",
        title: "No printer selected",
        message: "Please select a printer before submitting.",
      });
      return;
    }
    const getFilesToPrint = files.map((group) => group.items.filter((item) => selectedIds.has(item.id))).flat();
    const print = getFilesToPrint.map((item) => ({ ...item, printer: selectedPrinter }));
    const handleCreateBatch = async () => {
      setIsSubmitting(true);
      try {
        const submitBatchResponse = await window.api.submitBatch(print);

        if (!submitBatchResponse.success) {
          const firstError = submitBatchResponse.errors?.[0];

          setAlert({
            id: crypto.randomUUID(),
            type: firstError?.type || "Error",
            title: firstError?.title || "Batch submission failed",
            message: firstError?.message || "An unknown error occurred.",
          });

          if (submitBatchResponse.rollbackPerformed) {
            setAlert({
              id: crypto.randomUUID(),
              type: "Warning",
              title: "Batch rolled back",
              message: "The batch was automatically reverted, so the source files stayed in their original folders.",
            });
          }

          return;
        }

        setAlert({
          id: crypto.randomUUID(),
          type: "Success",
          title: "Batch submitted successfully",
          message: `Batch ID: ${submitBatchResponse.batchId}`,
        });

        await refreshFiles({ clearSelection: true });
        setSelectedPrinter(null);
      } catch (err) {
        setAlert({
          id: crypto.randomUUID(),
          type: "Error",
          title: err?.title || "Batch submission failed",
          message: err?.message || "Unexpected system error.",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    return handleCreateBatch();
  };

  const handleClearBtn = () => {
    setSelectedPrinter(null);
    clearSelection();
  };

  return (
    <div className={`${style.selection_container} ${isSelectionMode ? style.active : ""}`} ref={contentRef}>
      <div className={style.selection_items}>
        {selectedIds.size > 1 ? `${selectedIds.size} items selected` : `${selectedIds.size} item selected`}
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
              disabled={materialType !== printer.materialType || isSubmitting}
              checked={selectedPrinter === printer.value}
              onChange={() => setSelectedPrinter(printer.value)}
            />
            {printer.name}
          </label>
        ))}
        <div className={style.separator}></div>
        <button
          className={`${style.submit_button} ${isSubmitting ? style.submit_button_loading : ""}`}
          type="submit"
          disabled={!selectedPrinter || isSubmitting}
        >
          {isSubmitting ? <span className={style.spinner} /> : "Rip"}
        </button>
        <button className={style.clear_button} type="reset" onClick={handleClearBtn} disabled={isSubmitting}>
          Clear Selection
        </button>
      </form>
    </div>
  );
};

export default DataPrintSelection;
