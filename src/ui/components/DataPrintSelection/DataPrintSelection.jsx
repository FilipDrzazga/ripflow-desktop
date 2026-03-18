import { useEffect, useRef, useState } from "react";
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
  const store = useStore();
  const contentRef = useRef(null);

  const isSelectionMode = store.selectedIds.size > 0;
  const [isRendered, setIsRendered] = useState(isSelectionMode);
  const selectedMaterialTypes = new Set();
  store.filteredFiles.forEach((group) => {
    group.items.forEach((item) => {
      if (store.selectedIds.has(item.id)) {
        selectedMaterialTypes.add(item.materialType);
      }
    });
  });

  const materialType = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

  useEffect(() => {
    if (isSelectionMode) {
      setIsRendered(true);
    }
  }, [isSelectionMode]);

  useGSAP(
    () => {
      if (!isRendered || !contentRef.current) return;

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
        onComplete: () => {
          gsap.set(content, { clearProps: "transform,opacity,visibility" });
          setIsRendered(false);
        },
      });
    },
    { dependencies: [isRendered, isSelectionMode] },
  );

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
    const handleCreateBatch = async () => {
      try {
        const createBatchResponse = await window.api.createBatch(print);

        if (!createBatchResponse.success) {
          const firstError = createBatchResponse.errors?.[0];

          store.setAlert({
            id: crypto.randomUUID(),
            type: firstError?.type || "Error",
            title: firstError?.title || "Batch creation failed",
            message: firstError?.message || "An unknown error occurred.",
          });

          return;
        } else {
          store.setAlert({
            id: crypto.randomUUID(),
            type: "Success",
            title: "Batch created successfully",
            message: `Batch ID: ${createBatchResponse.batchId}`,
          });

          const createXMLResponse = await window.api.createXML(print, {
            batchId: createBatchResponse.batchId,
          });

          if (!createXMLResponse.success) {
            const firstError = createXMLResponse.errors?.[0];
            store.setAlert({
              id: crypto.randomUUID(),
              type: firstError?.type || "Error",
              title: firstError?.title || "XML creation failed",
              message: firstError?.message || "An unknown error occurred.",
            });

            return;
          } else {
            store.setAlert({
              id: crypto.randomUUID(),
              type: "Success",
              title: "XML created successfully",
              message: `Batch ID: ${createBatchResponse.batchId}`,
            });
          }
        }

        await store.refreshFiles({ clearSelection: true });
        setSelectedPrinter(null);
      } catch (err) {
        console.error("Error during batch creation or XML generation:", err);
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

  if (!isRendered) return null;

  return (
    <div className={`${style.selection_container} ${isSelectionMode ? style.active : ""}`} ref={contentRef}>
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
