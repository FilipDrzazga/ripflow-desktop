import { useEffect, useMemo, useRef, useState } from "react";
import { submitBatch } from "../../services/fileService";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import { runMutation } from "../../utils/runMutation";
import style from "./DataPrintSelection.module.css";
import { PRINTER } from "../../../shared/constants";

gsap.registerPlugin(useGSAP);

const PRINTERS = [
  { name: PRINTER.DGEN, value: PRINTER.DGEN, materialType: "Cottons" },
  { name: PRINTER.YOKO, value: PRINTER.YOKO, materialType: "Polyesters" },
  { name: PRINTER.YUMI, value: PRINTER.YUMI, materialType: "Polyesters" },
];

const DataPrintSelection = () => {
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const files = useStore((state) => state.files);
  const filteredFiles = useStore((state) => state.filteredFiles);
  const selectedIds = useStore((state) => state.selectedIds);
  const clearSelection = useStore((state) => state.toggleClearSelection);
  const refreshFiles = useStore((state) => state.refreshFiles);
  const refreshBatchDays = useStore((state) => state.refreshBatchDays);
  const setIsBatchSubmitting = useStore((state) => state.setIsBatchSubmitting);
  const selectedOverrides = useStore((state) => state.selectedOverrides);
  const fabricConfig = useStore((state) => state.fabricConfig);
  const clearAllOverrides = useStore((state) => state.clearAllOverrides);
  const contentRef = useRef(null);

  const isSelectionMode = selectedIds.size > 0;

  const materialType = useMemo(() => {
    const types = new Set();
    filteredFiles.forEach((group) => {
      group.items.forEach((item) => {
        if (selectedIds.has(item.id)) types.add(item.materialType);
      });
    });
    return types.size === 1 ? [...types][0] : null;
  }, [filteredFiles, selectedIds]);

  // Why the operator cannot print, when they cannot. Every printer radio is disabled for
  // an Unknown material class and so is Rip, and until now that happened in silence: the
  // operator sees dead controls and reaches for "the app is broken" long before reaching
  // for "this fabric is missing from the catalogue".
  //
  // Two causes, told apart, because they need different people: an incomplete catalogue is
  // fixed by the shop in Settings, an unreadable one is an outage. They collapse into one
  // "Unknown" downstream, so the split has to be made here, from the catalogue sentinel:
  // fabricConfig is null until the DB answers, exactly like shopProfile.
  //
  // It lives NEXT TO the disabled controls, not in a tooltip on the Rip button: a disabled
  // button does not reliably raise hover events in Chromium, so the tooltip would be a
  // message nobody can open - and the wrong hypothesis has already formed by the time
  // anyone hovers. Rendered only in selection mode, so it never nags an idle screen.
  const blockedReason = useMemo(() => {
    if (materialType !== "Unknown") return null;
    if (fabricConfig === null) {
      return "Fabric catalogue could not be read - check the connection to the shared database. Printing is blocked until it loads.";
    }
    const unknown = [];
    filteredFiles.forEach((group) => {
      group.items.forEach((item) => {
        if (selectedIds.has(item.id) && item.materialType === "Unknown" && item.material) {
          if (!unknown.includes(item.material)) unknown.push(item.material);
        }
      });
    });
    if (unknown.length === 0) return "Unknown material - this file has no fabric to route by, so no printer can be chosen.";
    return `Not in the fabric catalogue: ${unknown.join(", ")}. Add it in Settings > Fabrics to choose a printer.`;
  }, [materialType, fabricConfig, filteredFiles, selectedIds]);

  useEffect(() => {
    if (materialType === "Cottons") {
      setSelectedPrinter(PRINTER.DGEN);
    } else {
      setSelectedPrinter(null);
    }
  }, [materialType]);

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
      notify(
        { type: "Warning", title: "No printer selected", message: "Please select a printer before submitting." },
        { stage: "app", code: "NO_PRINTER_SELECTED" }
      );
      return;
    }
    const getFilesToPrint = files.map((group) => group.items.filter((item) => selectedIds.has(item.id))).flat();
    const print = getFilesToPrint.map((item) => ({ ...item, printer: selectedPrinter }));
    const handleCreateBatch = async () => {
      setIsSubmitting(true);
      setIsBatchSubmitting(true);
      try {
        const submitBatchResponse = await runMutation(() => submitBatch(print, selectedOverrides), {
          refresh: async () => { await refreshFiles({ clearSelection: true }); refreshBatchDays(); },
        });
        if (submitBatchResponse?.timedOut) return;

        if (!submitBatchResponse.success) {
          const firstError = submitBatchResponse.errors?.[0];

          notify(
            {
              type: firstError?.type || "Error",
              title: firstError?.title || "Batch submission failed",
              message: firstError?.message || "An unknown error occurred.",
            },
            {
              stage: "createBatch",
              code: firstError?.code || "BATCH_SUBMIT_FAILED",
              detail: submitBatchResponse.errors ? { errors: submitBatchResponse.errors } : null,
            }
          );

          if (submitBatchResponse.rollbackPerformed) {
            notify(
              {
                type: "Warning",
                title: "Batch rolled back",
                message: "The batch was automatically reverted, so the source files stayed in their original folders.",
              },
              { stage: "rollback", code: "AUTO_ROLLBACK" }
            );
          }

          return;
        }

        notify(
          {
            type: "Success",
            title: "Batch submitted successfully",
            message: `Batch ID: ${submitBatchResponse.batchId}`,
          },
          {
            stage: "createBatch",
            code: "BATCH_CREATED",
            detail: { batchId: submitBatchResponse.batchId },
          }
        );

        // Batch printed, but something downstream warned (e.g. tracking incomplete —
        // files won't appear in Production). The operator must see this despite success.
        if (submitBatchResponse.warnings?.length) {
          notify(
            {
              type: "Warning",
              title: "Batch printed with warnings",
              message: submitBatchResponse.warnings.join(" "),
            },
            {
              stage: "createBatch",
              code: "BATCH_SUBMIT_WARNING",
              detail: { warnings: submitBatchResponse.warnings },
            }
          );
        }

        clearAllOverrides();
        await refreshFiles({ clearSelection: true });
        await refreshBatchDays();
        setSelectedPrinter(null);
      } catch (err) {
        notify(
          {
            type: "Error",
            title: err?.title || "Batch submission failed",
            message: err?.message || "Unexpected system error.",
          },
          { stage: "createBatch", code: "BATCH_SUBMIT_EXCEPTION" }
        );
      } finally {
        setIsSubmitting(false);
        setIsBatchSubmitting(false);
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
      {blockedReason && (
        <>
          <div className={style.blocked_reason} role="status">
            {blockedReason}
          </div>
          <div className={style.separator}></div>
        </>
      )}
      <form className={style.selection_form} onSubmit={handleSubmit}>
        {PRINTERS.map((printer) => (
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
