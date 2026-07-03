import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import { LuArrowRight, LuArrowLeft, LuScissors, LuRefreshCw, LuCornerUpLeft, LuEye, LuListTree } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_NEXT, STAGE_PREV, PRODUCTION_STAGE, STAGE_COLOR } from "../../../shared/constants";
import {
  advanceStage,
  setSewingSent,
  setSewingReceived,
  printBatchLabel,
} from "../../services/productionService";
import { rollbackFile } from "../../services/batchService";
import { openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { getSettings } from "../../services/settingsService";
import { notify } from "@/utils/notify";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { PRINTER_COLORS } from "../../constants/printerColors";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import ProductionCard from "./ProductionCard";
import RipErrorPopover from "../RipErrorPopover/RipErrorPopover";
import ProductionRollbackModal from "./ProductionRollbackModal";
import OrderView from "./OrderView";
import style from "./Production.module.css";

const FILTER_TABS = [
  { key: "all",                        label: "All" },
  { key: PRODUCTION_STAGE.PRINTED,     label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS,   label: "Press" },
  { key: PRODUCTION_STAGE.QC,          label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING,   label: "Sew Out" },
  { key: PRODUCTION_STAGE.PACKED,      label: STAGE_LABEL.packed },
  { key: PRODUCTION_STAGE.SHIPPED,     label: STAGE_LABEL.shipped },
];

const POLL_INTERVAL = 15_000;

const STAGE_PIPELINE_ORDER = [
  PRODUCTION_STAGE.PRINTED, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING, PRODUCTION_STAGE.PACKED, PRODUCTION_STAGE.SHIPPED,
];

const BatchGroupHeader = ({ batchPath, rows, selectedFileIds, onSelectAll }) => {
  const batchName = batchPath?.split(/[/\\]/).pop() ?? "Unknown";
  const printerMatch = batchName.match(/-(DGEN|YOKO|YUMI)$/i);
  const printer = printerMatch ? printerMatch[1].toUpperCase() : null;
  const pc = printer ? (PRINTER_COLORS[printer] ?? { bg: "#f0f0f0", color: "#616161" }) : null;
  const stageCounts = {};
  for (const r of rows) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;
  const allSelected = rows.length > 0 && rows.every((r) => selectedFileIds.has(r.file_id));
  return (
    <div className={style.batch_group_header}>
      <span className={style.batch_group_name}>{batchName}</span>
      {pc && <span className={style.batch_group_printer} style={{ backgroundColor: pc.bg, color: pc.color }}>{printer}</span>}
      <span className={style.batch_group_count}>{rows.length} file{rows.length !== 1 ? "s" : ""}</span>
      <span className={style.batch_group_sep} />
      <div className={style.batch_group_stages}>
        {STAGE_PIPELINE_ORDER.filter((s) => stageCounts[s] > 0).map((s) => {
          const sc = STAGE_COLOR[s];
          return (
            <span key={s} className={style.batch_group_stage_pill} style={{ backgroundColor: sc?.bg, color: sc?.color }}>
              {stageCounts[s]} {STAGE_SHORT_LABEL[s]}
            </span>
          );
        })}
      </div>
      <button type="button" className={style.batch_group_select_btn} onClick={() => onSelectAll(rows)}>
        {allSelected ? "Deselect" : "Select All"}
      </button>
    </div>
  );
};

const Production = () => {
  const productionStages    = useStore((s) => s.productionStages);
  const loadAllStages       = useStore((s) => s.loadAllStages);
  const loadStagesAfter     = useStore((s) => s.loadStagesAfter);
  const updateStageInStore  = useStore((s) => s.updateStageInStore);
  const removeStageFromStore = useStore((s) => s.removeStageFromStore);
  const refreshFiles        = useStore((s) => s.refreshFiles);
  const loadAllStageHistory  = useStore((s) => s.loadAllStageHistory);
  const addStageHistoryEntry = useStore((s) => s.addStageHistoryEntry);
  const stageHistory         = useStore((s) => s.stageHistory);
  const ripErrors            = useStore((s) => s.ripErrors);
  const removeRipError       = useStore((s) => s.removeRipError);

  // "batches" = stage/batch lens (default); "orders" = order-centric read-only lens
  const [viewMode,       setViewMode]       = useState("batches");
  // Focus signal for the Orders lens: { keys, nonce } — "Show in Orders" sets it so
  // OrderView expands + scrolls to those orders. nonce makes repeat clicks re-fire.
  const [focusOrders,    setFocusOrders]    = useState(null);
  const [stageFilter,    setStageFilter]    = useState("all");
  const [search,         setSearch]         = useState("");
  const searchInputRef = useRef(null);
  const [batchFilter,    setBatchFilter]    = useState(null);
  const [workstationRole, setWorkstationRole] = useState("");
  const [isLoading,      setIsLoading]      = useState(false);

  const lastPollAt = useRef(null);

  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const handleScanRef = useRef(null);

  // Multi-select for bulk rollback
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());

  const [contextMenu, setContextMenu] = useState(null);
  const [rollbackTargets, setRollbackTargets] = useState(null); // stageRow[] → ProductionRollbackModal
  const [ripPopover, setRipPopover] = useState(null); // { error, x, y } → RipErrorPopover

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      loadAllStages(),
      loadAllStageHistory(),
      getSettings().then((res) => {
        if (!cancelled && res?.success) setWorkstationRole(res.settings.workstationRole ?? "");
      }),
    ]).finally(() => {
      if (!cancelled) {
        lastPollAt.current = new Date().toISOString();
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [loadAllStages, loadAllStageHistory]);

  // Poll for changes — only advance lastPollAt on success so a network failure retries the same window
  useEffect(() => {
    const id = setInterval(async () => {
      if (!lastPollAt.current) return;
      const since = lastPollAt.current;
      const result = await loadStagesAfter(since);
      if (result?.success !== false) {
        lastPollAt.current = new Date().toISOString();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [loadStagesAfter]);

  // ─── Action handlers ───────────────────────────────────────────────────────

  const handleAdvance = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const newStage = STAGE_NEXT[row.stage];
    if (!newStage) return;
    const now = new Date().toISOString();
    const res = await advanceStage(fileId, newStage, row.stage);
    if (res?.success) {
      updateStageInStore(fileId, { ...row, stage: newStage, updated_at: now });
      addStageHistoryEntry(fileId, newStage, now);
    }
  };

  const handleGoBack = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const prevStage = STAGE_PREV[row.stage];
    if (!prevStage) return;
    const now = new Date().toISOString();
    const res = await advanceStage(fileId, prevStage, row.stage);
    if (res?.success) {
      updateStageInStore(fileId, { ...row, stage: prevStage, updated_at: now });
      addStageHistoryEntry(fileId, prevStage, now);
    }
  };

  const handleSewing = async (fileId, sewingCompany) => {
    const row = productionStages[fileId];
    if (!row) return;
    const res = await setSewingSent(fileId, row.stage, sewingCompany ?? null);
    if (res?.success) {
      const now = new Date().toISOString();
      updateStageInStore(fileId, { ...row, stage: PRODUCTION_STAGE.TO_SEWING, sewing_sent_at: now, sewing_company: sewingCompany ?? null, updated_at: now });
      addStageHistoryEntry(fileId, PRODUCTION_STAGE.TO_SEWING, now);
    }
  };

  const handleReceive = async (fileId) => {
    const row = productionStages[fileId];
    if (!row || row.stage !== PRODUCTION_STAGE.TO_SEWING) return;
    const now = new Date().toISOString();
    const res = await setSewingReceived(fileId, PRODUCTION_STAGE.TO_SEWING);
    if (res?.success) {
      updateStageInStore(fileId, { ...row, stage: PRODUCTION_STAGE.PACKED, sewing_received_at: now, updated_at: now });
      addStageHistoryEntry(fileId, PRODUCTION_STAGE.PACKED, now);
    }
  };

  const handleReprintLabel = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const stageRows = Object.values(productionStages);
    const batchPath = row.batch_path;
    const batchName = batchPath?.split(/[/\\]/).pop() ?? "";
    const printerMatch = batchName.match(/-(DGEN|YOKO|YUMI)$/i);
    const printer = printerMatch ? printerMatch[1].toUpperCase() : "UNKNOWN";
    const batchRows = stageRows.filter((r) => r.batch_path === batchPath);
    const materials = [...new Set(batchRows.map((r) => r.material).filter(Boolean))];
    const material = materials.length === 1 ? materials[0] : "Mixed";
    const totalMeters = batchRows.reduce((sum, r) => sum + (r.meters ?? 0), 0);
    const res = await printBatchLabel({ batchPath, batchName, printer, fileCount: batchRows.length, material, totalMeters: Number(totalMeters.toFixed(2)) });
    if (res?.success) {
      notify({ type: "Success", title: "Label sent", message: batchName });
    } else {
      notify({ type: "Error", title: "Label print failed", message: res?.error ?? "Unknown error" });
    }
  };

  // decisions: [{ fileId, reason, override }] from ProductionRollbackModal.
  // override ({ qty } | { meters }) becomes the reprint request's qty_affected.
  const handleRollbackDecisions = async (decisions) => {
    setRollbackTargets(null);
    let successCount = 0;
    let failCount = 0;
    let timedOut = 0;
    for (const { fileId, reason, override } of decisions) {
      const row = useStore.getState().productionStages[fileId];
      if (!row?.batch_path) { failCount++; continue; }
      const filePath = `${row.batch_path}\\${fileId}.pdf`;
      const qtyAffected = override?.meters ?? override?.qty ?? null;
      // qtyOriginal must match qtyAffected's unit: this run's meters for LM, pieces otherwise
      const qtyOriginal = override?.meters != null
        ? (row.meters_override ?? row.meters ?? null)
        : (row.qty_override ?? row.qty ?? null);
      try {
        const res = await rollbackFile({
          filePath,
          batchPath: row.batch_path,
          reason,
          ...(qtyAffected != null ? { reprint: { qtyAffected, qtyOriginal } } : {}),
        });
        if (res?.success) {
          removeStageFromStore(fileId);
          removeRipError(fileId);
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        // Timeout means the op keeps running in main — count it apart, never fail the loop.
        if (err?.timedOut) timedOut++;
        else failCount++;
      }
    }
    setSelectedFileIds(new Set());

    // Once, after the loop: in-progress ops get a single warning + one state refresh.
    if (timedOut > 0) {
      notify({ type: "Warning", title: "Operations still in progress", message: `${timedOut} operation(s) taking longer than expected — refreshing state.` });
      await refreshFiles();
      loadAllStages();
    }

    if (failCount === 0 && successCount > 0) {
      notify({ type: "Success", title: "Rolled back", message: `${successCount} file(s) returned to inbox.` });
    } else if (successCount > 0) {
      notify({ type: "Warning", title: "Partially rolled back", message: `${successCount} succeeded, ${failCount} failed.` });
    } else if (failCount > 0) {
      notify({ type: "Error", title: "Rollback failed", message: `${failCount} file(s) could not be rolled back.` });
    }
    if (successCount > 0) refreshFiles();
  };

  const {
    openPreview, closePreview, navigate: navigatePreview,
    isOpen: isPreviewOpen, isLoading: isPreviewLoading,
    imgSrc: previewImgSrc, error: previewError,
    currentPath: previewCurrentPath, currentIndex: previewCurrentIndex, fileList: previewFileList,
  } = usePdfPreview();

  const handleOpenPreview = (row) => {
    const filePath = `${row.batch_path}\\${row.file_id}.pdf`;
    const batchFileList = Object.values(productionStages)
      .filter((r) => r.batch_path === row.batch_path)
      .map((r) => ({ path: `${r.batch_path}\\${r.file_id}.pdf`, name: `${r.file_id}.pdf` }));
    openPreview(filePath, batchFileList);
  };

  const handleOpenInFolder = async (path) => {
    const res = await openInFolderApi(path);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        { type: err?.type || "Error", title: err?.title || "Open folder failed", message: err?.message || "Could not open folder." },
        { stage: "app", code: "OPEN_FOLDER_FAILED" },
      );
    }
  };

  const handleOpenInShopify = async (orderId) => {
    if (!orderId) {
      notify({ type: "Warning", title: "No order number", message: "No order number for this file." },
        { stage: "app", code: "SHOPIFY_NO_ORDER_ID" });
      return;
    }
    const res = await openInShopifyApi(orderId);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        { type: err?.type || "Error", title: err?.title || "Open in Shopify failed", message: err?.message || "Could not open Shopify order." },
        { stage: "app", code: "OPEN_SHOPIFY_FAILED" },
      );
    }
  };

  // ─── Multi-select ─────────────────────────────────────────────────────────

  const toggleProductionSelect = useCallback((fileId) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const [groupingEnabled, setGroupingEnabled] = useState(true);

  const handleSelectBatch = useCallback((rows) => {
    const ids = rows.map((r) => r.file_id);
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      const allAlreadySelected = ids.every((id) => next.has(id));
      if (allAlreadySelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAllStages(), loadAllStageHistory()]);
      lastPollAt.current = new Date().toISOString();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBulkGoBack = async () => {
    const ids = [...selectedFileIds];
    let count = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r) continue;
      const prevStage = STAGE_PREV[r.stage];
      if (!prevStage) continue;
      const now = new Date().toISOString();
      const res = await advanceStage(id, prevStage, r.stage);
      if (res?.success) {
        updateStageInStore(id, { ...r, stage: prevStage, updated_at: now });
        addStageHistoryEntry(id, prevStage, now);
        count++;
      }
    }
    setSelectedFileIds(new Set());
    if (count > 0) notify({ type: "Success", title: "Moved back", message: `${count} file(s) moved back.` });
  };

  const handleBulkAdvance = async () => {
    const ids = [...selectedFileIds];
    let count = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r) continue;
      const newStage = STAGE_NEXT[r.stage];
      if (!newStage) continue;
      const now = new Date().toISOString();
      const res = await advanceStage(id, newStage, r.stage);
      if (res?.success) {
        updateStageInStore(id, { ...r, stage: newStage, updated_at: now });
        addStageHistoryEntry(id, newStage, now);
        count++;
      }
    }
    // Keep the selection on files that survive in the store (advanced files stay
    // selected so the operator can act on them again); drop any that vanished.
    setSelectedFileIds((prev) => {
      const next = new Set();
      for (const id of prev) if (productionStages[id]) next.add(id);
      return next;
    });
    if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to next stage." });
  };

  const handleBulkReceive = async () => {
    const ids = [...selectedFileIds];
    let count = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r || r.stage !== PRODUCTION_STAGE.TO_SEWING) continue;
      const now = new Date().toISOString();
      const res = await setSewingReceived(id, PRODUCTION_STAGE.TO_SEWING);
      if (res?.success) {
        updateStageInStore(id, { ...r, stage: PRODUCTION_STAGE.PACKED, sewing_received_at: now, updated_at: now });
        addStageHistoryEntry(id, PRODUCTION_STAGE.PACKED, now);
        count++;
      }
    }
    // Keep the selection on files that survive in the store; drop any that vanished.
    setSelectedFileIds((prev) => {
      const next = new Set();
      for (const id of prev) if (productionStages[id]) next.add(id);
      return next;
    });
    if (count > 0) notify({ type: "Success", title: "Received from sewing", message: `${count} file(s) received.` });
  };

  const handleBulkSewing = async (sewingCompany) => {
    const ids = [...selectedFileIds];
    let count = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r || r.stage !== PRODUCTION_STAGE.QC) continue;
      const now = new Date().toISOString();
      const res = await setSewingSent(id, PRODUCTION_STAGE.QC, sewingCompany ?? null);
      if (res?.success) {
        updateStageInStore(id, { ...r, stage: PRODUCTION_STAGE.TO_SEWING, sewing_sent_at: now, sewing_company: sewingCompany ?? null, updated_at: now });
        addStageHistoryEntry(id, PRODUCTION_STAGE.TO_SEWING, now);
        count++;
      }
    }
    setSelectedFileIds(new Set());
    if (count > 0) notify({ type: "Success", title: "Sent to sewing", message: `${count} file(s) sent to ${sewingCompany}.` });
  };

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [batchFilter, stageFilter]);

  // ─── Scanner ───────────────────────────────────────────────────────────────

  const handleScan = useCallback(async (value) => {
    // A scan acts on the Batches lens (filter/scroll/highlight). If we're on the
    // Orders lens, flip back first so the result is actually visible instead of
    // silently mutating the hidden Batches state. Idempotent when already on Batches.
    setViewMode("batches");

    const isBatchPath = value.includes("\\") || value.includes("/");

    let resolvedBatchPath = null;
    if (isBatchPath) {
      resolvedBatchPath = value;
    } else {
      const nameMatch = Object.values(productionStages).find(
        (r) => r.batch_path?.split(/[/\\]/).pop() === value,
      );
      if (nameMatch) {
        resolvedBatchPath = nameMatch.batch_path;
      } else if (/^\d{6}$/.test(value)) {
        const tsMatch = Object.values(productionStages).find(
          (r) => r.batch_path?.split(/[/\\]/).pop().startsWith(`PRINTED_${value}`),
        );
        if (tsMatch) resolvedBatchPath = tsMatch.batch_path;
      }
    }

    if (resolvedBatchPath) {
      const batchFiles = Object.values(productionStages).filter((s) => s.batch_path === resolvedBatchPath);

      if (batchFiles.length === 0) {
        notify({ type: "Error", title: "Not found", message: `Batch not found: ${resolvedBatchPath.split(/[/\\]/).pop()}` });
        return;
      }

      setBatchFilter(resolvedBatchPath);

      if (workstationRole === "cotton") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.PRINTED);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Printed stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        let count = 0;
        for (const f of targets) {
          const r1 = await advanceStage(f.file_id, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.PRINTED);
          if (!r1?.success) continue;
          updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.HEATPRESS, updated_at: now });
          addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.HEATPRESS, now);
          count++;
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to Heat Press" });
        return;
      }

      if (workstationRole === "polyester") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.PRINTED);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Printed stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        let count = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.PRINTED);
          if (res?.success) {
            updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.HEATPRESS, updated_at: now });
            addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.HEATPRESS, now);
            count++;
          }
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to Heat Press" });
        return;
      }

      if (workstationRole === "rollpress") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.HEATPRESS);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Heat Press stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        const advancedIds = new Set();
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.QC, f.stage);
          if (res?.success) {
            updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.QC, updated_at: now });
            addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.QC, now);
            advancedIds.add(f.file_id);
          }
        }
        if (advancedIds.size === 0) {
          notify({ type: "Error", title: "Advance failed", message: "Could not advance files to QC." });
          return;
        }
        notify({ type: "Success", title: "Advanced to QC", message: `${advancedIds.size} file(s) moved to QC.` });
        return;
      }

      if (workstationRole === "qc") {
        // Cotton roll heat-press has no scanner — the QC station completes the
        // heatpress → qc transition for the whole batch on scan. Manual
        // Pass/Rollback via the context menu still applies per file.
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.HEATPRESS);
        if (targets.length === 0) return; // scan only filters the view to the batch
        const now = new Date().toISOString();
        let count = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.QC, PRODUCTION_STAGE.HEATPRESS);
          if (res?.success) {
            updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.QC, updated_at: now });
            addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.QC, now);
            count++;
          }
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to QC" });
        return;
      }

      // workstationRole === "" (default): scan only filters the view to the batch
      // (setBatchFilter above). No auto-advance, no modal.
      return;
    }

    // File-level scan — scroll and highlight the card
    const row = productionStages[value];
    if (!row) {
      notify({ type: "Error", title: "Not found", message: `Order not found: ${value}` });
      return;
    }
    setStageFilter("all");
    setBatchFilter(null);
    setSearch("");
    setHighlightedId(value);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-file-id="${CSS.escape(value)}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setHighlightedId(null), 1500);
    notify({ type: "Success", title: "Order found", message: `${row.order_id ?? value}` });
  }, [productionStages, workstationRole, updateStageInStore, addStageHistoryEntry]);

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  useEffect(() => {
    let buffer = "";
    let timer = null;
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      clearTimeout(timer);
      if (e.key === "Enter") {
        if (buffer.length > 5) handleScanRef.current?.(buffer.trim());
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
      timer = setTimeout(() => { buffer = ""; }, 100);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ─── Filtering ────────────────────────────────────────────────────────────

  const allRows = Object.values(productionStages);

  const filtered = allRows.filter((row) => {
    if (batchFilter && row.batch_path !== batchFilter) return false;
    if (stageFilter !== "all" && row.stage !== stageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return row.order_id?.toLowerCase().includes(q) || row.customer_name?.toLowerCase().includes(q);
    }
    return true;
  });

  // Tab counts reflect the current batch filter when active
  const countableRows = batchFilter ? allRows.filter((r) => r.batch_path === batchFilter) : allRows;
  const counts = Object.fromEntries(
    FILTER_TABS.map((tab) => [
      tab.key,
      tab.key === "all" ? countableRows.length : countableRows.filter((r) => r.stage === tab.key).length,
    ]),
  );
  const isGrouped = groupingEnabled && (stageFilter === "all" || batchFilter !== null);

  const groupedBatches = useMemo(() => {
    const map = new Map();
    for (const row of filtered) {
      const key = row.batch_path ?? "__no_batch__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()];
  }, [filtered]);

  // ─── Context menu options (memoized) ─────────────────────────────────────

  const contextMenuOptions = useMemo(() => {
    if (!contextMenu) return [];
    const row = contextMenu.row;
    const fileId = row.file_id;
    const batchPath = row.batch_path;
    const filePath = batchPath ? `${batchPath}\\${fileId}.pdf` : null;

    // Stage-aware: when files are selected, the menu reflects the WHOLE selection;
    // otherwise it falls back to the clicked row. An action shows only when it is
    // valid for EVERY target file (common availability).
    const isBulk = selectedFileIds.size > 0 && selectedFileIds.has(fileId);
    const targetRows = isBulk
      ? [...selectedFileIds].map((id) => productionStages[id]).filter(Boolean)
      : [row];
    const count = targetRows.length;

    const stages = new Set(targetRows.map((r) => r.stage));
    const allSameStage = stages.size === 1;
    const onlyStage = allSameStage ? [...stages][0] : null;

    const canPass = count > 0 && targetRows.every(
      (r) => STAGE_NEXT[r.stage] && r.stage !== PRODUCTION_STAGE.TO_SEWING && r.stage !== PRODUCTION_STAGE.SHIPPED,
    );
    const canReceive  = count > 0 && targetRows.every((r) => r.stage === PRODUCTION_STAGE.TO_SEWING);
    const canSew      = count > 0 && targetRows.every((r) => r.stage === PRODUCTION_STAGE.QC);
    const canGoBack   = count > 0 && targetRows.every((r) => STAGE_PREV[r.stage]);
    const canRollback = count > 0 && targetRows.every((r) => r.batch_path && r.stage !== PRODUCTION_STAGE.SHIPPED);

    const items = [];

    // ── Stage actions ──
    if (canPass) {
      items.push({
        id: "advance",
        label: allSameStage ? `Pass to ${STAGE_LABEL[STAGE_NEXT[onlyStage]]}` : "Pass to next stage",
        icon: <LuArrowRight size={14} />,
        advance: true,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkAdvance();
          else handleAdvance(fileId);
        },
      });
    }
    if (canReceive) {
      items.push({
        id: "receive",
        label: "Receive from sewing",
        icon: <LuArrowRight size={14} />,
        advance: true,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkReceive();
          else handleReceive(fileId);
        },
      });
    }
    if (canSew) {
      items.push({
        id: "sewing",
        label: "Send to Sewing",
        icon: <LuScissors size={14} />,
        children: [
          { id: "sewing-olya",     label: "Olya",     onClick: () => { if (isBulk) handleBulkSewing("Olya"); else handleSewing(fileId, "Olya"); } },
          { id: "sewing-vagabond", label: "Vagabond", onClick: () => { if (isBulk) handleBulkSewing("Vagabond"); else handleSewing(fileId, "Vagabond"); } },
        ],
      });
    }
    if (canGoBack) {
      items.push({
        id: "go-back",
        label: allSameStage ? `Back to ${STAGE_LABEL[STAGE_PREV[onlyStage]]}` : "Go back",
        icon: <LuArrowLeft size={14} />,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkGoBack();
          else handleGoBack(fileId);
        },
      });
    }
    if (canRollback) {
      items.push({
        id: "rollback",
        label: count > 1 ? `Rollback ${count} files` : "Rollback this file",
        icon: <LuCornerUpLeft size={14} />,
        danger: true,
        onClick: () => {
          setContextMenu(null);
          const rows = targetRows.filter((r) => r?.batch_path);
          if (rows.length > 0) setRollbackTargets(rows);
        },
      });
    }

    if (items.length > 0) items.push({ id: "sep-tools", separator: true });

    // ── Tools (always operate on the clicked row) ──
    if (batchPath) {
      items.push({
        id: "reprint-label",
        label: "Reprint Label",
        icon: <LuRefreshCw size={14} />,
        amber: true,
        onClick: () => { setContextMenu(null); handleReprintLabel(fileId); },
      });
    }
    if (filePath) {
      items.push({
        id: "preview",
        label: "Quick Preview",
        icon: <LuEye size={14} />,
        onClick: () => { setContextMenu(null); handleOpenPreview(row); },
      });
    }
    if (batchPath) {
      items.push({
        id: "folder",
        label: "Open in Folder",
        onClick: () => { setContextMenu(null); handleOpenInFolder(batchPath); },
      });
    }
    items.push({
      id: "shopify",
      label: "Open in Shopify",
      onClick: () => { setContextMenu(null); handleOpenInShopify(row.order_id); },
    });

    // "Show in Orders" deliberately operates on the SELECTION (like the stage
    // actions above), not just the clicked row — the exception to the "tools
    // operate on the clicked row" rule. It flips to the Orders lens and asks
    // OrderView to expand + scroll to every selected file's order.
    if (targetRows.length > 0) {
      // Same key logic as groupByOrder: trimmed order_id, else the unknown bucket.
      // The "__UNKNOWN_ORDER__" literal must stay in sync with groupByOrder.js
      // (it is a bare literal there, not an exported constant).
      const orderKeys = [...new Set(
        targetRows.map((r) =>
          (typeof r?.order_id === "string" && r.order_id.trim() !== "")
            ? r.order_id.trim()
            : "__UNKNOWN_ORDER__",
        ),
      )];
      items.push({
        id: "show-in-orders",
        label: "Show in Orders",
        icon: <LuListTree size={14} />,
        onClick: () => {
          setContextMenu(null);
          setSearch(""); // clear search so the order isn't filtered out in OrderView
          setViewMode("orders");
          setFocusOrders({ keys: orderKeys, nonce: Date.now() });
        },
      });
    }

    return items;
  }, [contextMenu, selectedFileIds, productionStages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={style.container}>

      <div className={style.top_section}>
      <div className={style.topbar}>
        <h2 className={style.title}>Production</h2>

        {/* Lens toggle: batch/stage view vs read-only order-centric view */}
        <div className={style.tabs}>
          <button
            type="button"
            className={`${style.tab} ${viewMode === "batches" ? style.tab_active : ""}`}
            onClick={() => setViewMode("batches")}
          >
            Batches
          </button>
          <button
            type="button"
            className={`${style.tab} ${viewMode === "orders" ? style.tab_active : ""}`}
            onClick={() => setViewMode("orders")}
          >
            Orders
          </button>
        </div>

        {viewMode === "batches" && <div className={style.topbar_sep} />}

        {viewMode === "batches" && (
          <div className={style.tabs}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${style.tab} ${stageFilter === tab.key ? style.tab_active : ""}`}
                onClick={() => setStageFilter(tab.key)}
              >
                {tab.label}
                {counts[tab.key] > 0 && <span className={style.tab_count}>{counts[tab.key]}</span>}
              </button>
            ))}
          </div>
        )}

        <div className={style.topbar_right}>
          {viewMode === "batches" && (
            <>
              <label className={style.group_toggle}>
                <input
                  type="checkbox"
                  checked={groupingEnabled}
                  onChange={(e) => setGroupingEnabled(e.target.checked)}
                  className={style.group_toggle_checkbox}
                />
                Groups
              </label>
              <div className={style.topbar_right_sep} />
            </>
          )}
          <div className={style.search_wrapper}>
            <HiMagnifyingGlass className={style.search_icon} />
            <input
              ref={searchInputRef}
              className={style.search_input}
              placeholder="Search order ID or customer... (Enter to scan)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (viewMode !== "batches") return; // scan-to-filter is a batch-lens action
                const val = search.trim();
                if (val.length <= 5) return;
                const isBatchName = Object.values(productionStages).some(
                  (r) => r.batch_path?.split(/[/\\]/).pop() === val
                );
                const isFileId = !!productionStages[val];
                const isBatchPath = val.includes("\\") || val.includes("/");
                if (isBatchName || isFileId || isBatchPath) {
                  handleScan(val);
                  setSearch("");
                }
              }}
            />
            {search && (
              <button
                className={style.search_clear}
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
              >
                <HiXMark />
              </button>
            )}
          </div>
          <button type="button" className={style.refresh_btn} onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? <span className={style.spinner} /> : <LuRefreshCw size={15} />}
          </button>
        </div>
      </div>

      {viewMode === "batches" && batchFilter && (
        <div className={style.filter_bar}>
          <span className={style.filter_bar_label}>Batch:</span>
          <button type="button" className={style.batch_chip} onClick={() => setBatchFilter(null)}>
            {batchFilter.split(/[/\\]/).pop()} ×
          </button>
        </div>
      )}
      </div>

      <div className={style.cards_wrapper}>
        {viewMode === "orders" ? (
          <OrderView searchQuery={search} focusOrders={focusOrders} />
        ) : isLoading && allRows.length === 0 ? (
          <div className={style.loading_state}>
            <div className={style.loading_spinner} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={style.empty_state}>
            <span className={style.empty_text}>No jobs match the current filter.</span>
          </div>
        ) : isGrouped ? (
          groupedBatches.map(([batchPath, rows]) => (
            <div key={batchPath} className={style.batch_group}>
              <BatchGroupHeader
                batchPath={batchPath}
                rows={rows}
                selectedFileIds={selectedFileIds}
                onSelectAll={handleSelectBatch}
              />
              {rows.map((row) => (
                <ProductionCard
                  key={row.file_id}
                  stage={row}
                  history={stageHistory[row.file_id] ?? []}
                  highlighted={highlightedId === row.file_id}
                  selected={selectedFileIds.has(row.file_id)}
                  awaitingQc={workstationRole === "qc" && row.stage === PRODUCTION_STAGE.HEATPRESS}
                  ripError={ripErrors[row.file_id]}
                  onRipBadgeClick={(error, x, y) => setRipPopover({ error, x, y })}
                  onSelect={toggleProductionSelect}
                  onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
                />
              ))}
            </div>
          ))
        ) : (
          filtered.map((row) => (
            <ProductionCard
              key={row.file_id}
              stage={row}
              history={stageHistory[row.file_id] ?? []}
              highlighted={highlightedId === row.file_id}
              selected={selectedFileIds.has(row.file_id)}
              awaitingQc={workstationRole === "qc" && row.stage === PRODUCTION_STAGE.HEATPRESS}
              ripError={ripErrors[row.file_id]}
              onRipBadgeClick={(error, x, y) => setRipPopover({ error, x, y })}
              onSelect={toggleProductionSelect}
              onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
            />
          ))
        )}
      </div>

      <PdfPreviewModal
        isOpen={isPreviewOpen}
        isLoading={isPreviewLoading}
        imgSrc={previewImgSrc}
        error={previewError}
        currentPath={previewCurrentPath}
        currentIndex={previewCurrentIndex}
        fileList={previewFileList}
        onClose={closePreview}
        onNavigate={navigatePreview}
      />

      {/* Context menu */}
      {contextMenu && createPortal(
        <ContextMenu
          id="production-context-menu"
          anchorX={contextMenu.x}
          anchorY={contextMenu.y}
          onClose={() => setContextMenu(null)}
          options={contextMenuOptions}
        />,
        document.body,
      )}

      {/* RIP-error detail popover (anchored to the clicked file badge) */}
      {ripPopover && createPortal(
        <RipErrorPopover
          error={ripPopover.error}
          anchorX={ripPopover.x}
          anchorY={ripPopover.y}
          onClose={() => setRipPopover(null)}
        />,
        document.body,
      )}

      {/* Rollback modal (reason + qty affected) */}
      {rollbackTargets && (
        <ProductionRollbackModal
          rows={rollbackTargets}
          onConfirm={handleRollbackDecisions}
          onCancel={() => setRollbackTargets(null)}
        />
      )}

    </div>
  );
};

export default Production;
