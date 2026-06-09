import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { HiMagnifyingGlass, HiArrowPath } from "react-icons/hi2";
import { LuArrowRight, LuArrowLeft, LuScissors, LuRefreshCw, LuCornerUpLeft, LuEye, LuTrash2 } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { STAGE_LABEL, STAGE_NEXT, STAGE_PREV, PRODUCTION_STAGE, QC_ACTION } from "../../../shared/constants";
import {
  advanceStage,
  setSewingSent,
  setSewingReceived,
  printBatchLabel,
} from "../../services/productionService";
import { rollbackFile } from "../../services/batchService";
import { openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { getSettings } from "../../services/settingsService";
import { showConfirm } from "../../services/systemService";
import { notify } from "@/utils/notify";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { resolveIcon } from "../../constants/rollbackReasonIcons";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import ProductionCard from "./ProductionCard";
import QCModal from "./QCModal";
import style from "./Production.module.css";

const FILTER_TABS = [
  { key: "all",                        label: "All" },
  { key: PRODUCTION_STAGE.PRINTED,     label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS,   label: STAGE_LABEL.heatpress },
  { key: PRODUCTION_STAGE.QC,          label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING,   label: STAGE_LABEL.to_sewing },
  { key: PRODUCTION_STAGE.FROM_SEWING, label: STAGE_LABEL.from_sewing },
  { key: PRODUCTION_STAGE.PACKED,      label: STAGE_LABEL.packed },
  { key: PRODUCTION_STAGE.SHIPPED,     label: STAGE_LABEL.shipped },
];

const POLL_INTERVAL = 15_000;

const Production = () => {
  const productionStages    = useStore((s) => s.productionStages);
  const loadAllStages       = useStore((s) => s.loadAllStages);
  const loadStagesAfter     = useStore((s) => s.loadStagesAfter);
  const updateStageInStore  = useStore((s) => s.updateStageInStore);
  const removeStageFromStore = useStore((s) => s.removeStageFromStore);
  const reasonDefinitions   = useStore((s) => s.reasonDefinitions);
  const stageHistory         = useStore((s) => s.stageHistory);
  const loadAllStageHistory  = useStore((s) => s.loadAllStageHistory);
  const addStageHistoryEntry = useStore((s) => s.addStageHistoryEntry);
  const clearAllStages       = useStore((s) => s.clearAllStages);

  const [stageFilter,    setStageFilter]    = useState("all");
  const [search,         setSearch]         = useState("");
  const [batchFilter,    setBatchFilter]    = useState(null);
  const [workstationRole, setWorkstationRole] = useState("");
  const [isLoading,      setIsLoading]      = useState(false);

  const lastPollAt = useRef(null);

  // QC modal
  const [qcModalOpen,  setQcModalOpen]  = useState(false);
  const [qcModalBatch, setQcModalBatch] = useState(null);

  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const handleScanRef = useRef(null);

  // Multi-select for bulk rollback
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());

  const [contextMenu, setContextMenu] = useState(null);
  const [otherReasonTarget, setOtherReasonTarget] = useState(null);
  const [otherReasonText, setOtherReasonText] = useState("");

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

  const handleSewing = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const res = await setSewingSent(fileId, row.stage);
    if (res?.success) {
      const now = new Date().toISOString();
      updateStageInStore(fileId, { ...row, stage: PRODUCTION_STAGE.TO_SEWING, updated_at: now });
      addStageHistoryEntry(fileId, PRODUCTION_STAGE.TO_SEWING, now);
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
    const res = await printBatchLabel({ batchPath, batchName, printer, fileCount: batchRows.length, material });
    if (res?.success) {
      notify({ type: "Success", title: "Label sent", message: batchName });
    } else {
      notify({ type: "Error", title: "Label print failed", message: res?.error ?? "Unknown error" });
    }
  };

  const handleRollbackWithReason = async (fileId, batchPath, reason) => {
    const filePath = `${batchPath}\\${fileId}.pdf`;
    const res = await rollbackFile({ filePath, batchPath, reason });
    if (res?.success) {
      removeStageFromStore(fileId);
      notify({ type: "Success", title: "Rolled back", message: "File returned to inbox." });
    } else {
      notify({ type: "Error", title: "Rollback failed", message: res?.errors?.[0]?.message ?? "Unknown error" });
    }
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

  // ─── QC modal confirm ──────────────────────────────────────────────────────

  const handleQcConfirm = async (decisions) => {
    let successCount = 0;
    let failCount = 0;

    for (const { fileId, action, fromSewing, reason } of decisions) {
      try {
        // setSewingReceived only for received-from-sewing files; skip if rejecting
        if (fromSewing && action !== QC_ACTION.REJECT) {
          const srRes = await setSewingReceived(fileId, PRODUCTION_STAGE.TO_SEWING);
          if (!srRes?.success) { failCount++; continue; }
        }

        if (action === QC_ACTION.PASS) {
          const expectedForPacked = fromSewing ? PRODUCTION_STAGE.FROM_SEWING : PRODUCTION_STAGE.QC;
          const res = await advanceStage(fileId, PRODUCTION_STAGE.PACKED, expectedForPacked);
          if (res?.success) {
            const now = new Date().toISOString();
            const row = productionStages[fileId];
            if (row) {
              updateStageInStore(fileId, { ...row, stage: PRODUCTION_STAGE.PACKED, updated_at: now });
              addStageHistoryEntry(fileId, PRODUCTION_STAGE.PACKED, now);
            }
            successCount++;
          } else {
            failCount++;
          }
        } else if (action === QC_ACTION.SEWING) {
          const res = await setSewingSent(fileId, PRODUCTION_STAGE.QC);
          if (res?.success) {
            const now = new Date().toISOString();
            const row = productionStages[fileId];
            if (row) {
              updateStageInStore(fileId, { ...row, stage: PRODUCTION_STAGE.TO_SEWING, updated_at: now });
              addStageHistoryEntry(fileId, PRODUCTION_STAGE.TO_SEWING, now);
            }
            successCount++;
          } else {
            failCount++;
          }
        } else if (action === QC_ACTION.REJECT) {
          const row = productionStages[fileId];
          if (!row?.batch_path) { failCount++; continue; }
          const filePath = `${row.batch_path}\\${fileId}.pdf`;
          const res = await rollbackFile({ filePath, batchPath: row.batch_path, reason });
          if (res?.success) {
            removeStageFromStore(fileId);
            successCount++;
          } else {
            failCount++;
          }
        }
      } catch {
        failCount++;
      }
    }

    setQcModalOpen(false);

    if (failCount === 0) {
      notify({ type: "Success", title: "QC complete", message: `${successCount} file(s) processed` });
    } else if (successCount > 0) {
      notify({ type: "Warning", title: "QC partially done", message: `${successCount} succeeded, ${failCount} failed.` });
    } else {
      notify({ type: "Error", title: "QC failed", message: `${failCount} file(s) could not be processed.` });
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

  const clearProductionSelection = useCallback(() => setSelectedFileIds(new Set()), []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAllStages(), loadAllStageHistory()]);
      lastPollAt.current = new Date().toISOString();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearAll = async () => {
    const confirmed = await showConfirm(
      "Clear all production tracking data? This cannot be undone.",
    );
    if (!confirmed) return;
    await clearAllStages();
    lastPollAt.current = new Date().toISOString();
    notify({ type: "Success", title: "Production cleared", message: "All tracking data removed." });
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
    setSelectedFileIds(new Set());
    if (count > 0) notify({ type: "Success", title: "Advanced", message: `${count} file(s) advanced.` });
  };

  const handleBulkRollback = async (reason) => {
    const ids = [...selectedFileIds];
    let successCount = 0;
    let failCount = 0;
    for (const fileId of ids) {
      const row = productionStages[fileId];
      if (!row?.batch_path) { failCount++; continue; }
      const filePath = `${row.batch_path}\\${fileId}.pdf`;
      const res = await rollbackFile({ filePath, batchPath: row.batch_path, reason });
      if (res?.success) {
        removeStageFromStore(fileId);
        successCount++;
      } else {
        failCount++;
      }
    }
    setSelectedFileIds(new Set());
    if (failCount === 0) {
      notify({ type: "Success", title: "Rolled back", message: `${successCount} file(s) returned to inbox.` });
    } else if (successCount > 0) {
      notify({ type: "Warning", title: "Partially rolled back", message: `${successCount} succeeded, ${failCount} failed.` });
    } else {
      notify({ type: "Error", title: "Rollback failed", message: `${failCount} file(s) could not be rolled back.` });
    }
  };

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [batchFilter, stageFilter]);

  // ─── Scanner ───────────────────────────────────────────────────────────────

  const handleScan = useCallback(async (value) => {
    const isBatchPath = value.includes("\\") || value.includes("/");

    let resolvedBatchPath = null;
    if (isBatchPath) {
      resolvedBatchPath = value;
    } else {
      const nameMatch = Object.values(productionStages).find(
        (r) => r.batch_path?.split(/[/\\]/).pop() === value,
      );
      if (nameMatch) resolvedBatchPath = nameMatch.batch_path;
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
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.HEATPRESS, f.stage);
          if (res?.success) {
            updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.HEATPRESS, updated_at: now });
            addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.HEATPRESS, now);
            count++;
          }
        }
        if (count > 0) notify({ type: "Success", title: "Advanced", message: `${count} file(s) → Heat Press` });
        return;
      }

      if (workstationRole === "rollpress") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.HEATPRESS);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Heat Press stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        let count = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.QC, f.stage);
          if (res?.success) {
            updateStageInStore(f.file_id, { ...f, stage: PRODUCTION_STAGE.QC, updated_at: now });
            addStageHistoryEntry(f.file_id, PRODUCTION_STAGE.QC, now);
            count++;
          }
        }
        if (count > 0) notify({ type: "Success", title: "Advanced", message: `${count} file(s) → QC` });
        return;
      }

      if (workstationRole === "qc") {
        const qcOrSewing = batchFiles.filter((f) =>
          f.stage === PRODUCTION_STAGE.QC || f.stage === PRODUCTION_STAGE.TO_SEWING,
        );
        if (qcOrSewing.length === 0) {
          notify({ type: "Warning", title: "Nothing to process", message: "No files awaiting QC in this batch." });
          return;
        }
        setQcModalBatch({ batchPath: resolvedBatchPath, files: batchFiles });
        setQcModalOpen(true);
        return;
      }

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

  // ─── Context menu options (memoized) ─────────────────────────────────────

  const contextMenuOptions = useMemo(() => {
    if (!contextMenu) return [];
    const row = contextMenu.row;
    const fileId = row.file_id;
    const batchPath = row.batch_path;
    const filePath = batchPath ? `${batchPath}\\${fileId}.pdf` : null;
    const isShipped = row.stage === PRODUCTION_STAGE.SHIPPED;
    const isAtQC = row.stage === PRODUCTION_STAGE.QC;
    const canAdvance = !isShipped;
    const nextStage = STAGE_NEXT[row.stage];
    const prevStage = STAGE_PREV[row.stage];
    const isBulk = selectedFileIds.size > 0 && selectedFileIds.has(fileId);
    const items = [];

    if (prevStage) {
      items.push({
        id: "go-back",
        label: isBulk ? `Move back ${selectedFileIds.size} selected` : STAGE_LABEL[prevStage],
        icon: <LuArrowLeft size={14} />,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkGoBack();
          else handleGoBack(fileId);
        },
      });
    }
    if (canAdvance && nextStage) {
      items.push({
        id: "advance",
        label: isBulk ? `Advance ${selectedFileIds.size} selected` : STAGE_LABEL[nextStage],
        icon: <LuArrowRight size={14} />,
        advance: true,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkAdvance();
          else handleAdvance(fileId);
        },
      });
    }
    if (batchPath) {
      items.push({
        id: "reprint-label",
        label: "Reprint Label",
        icon: <LuRefreshCw size={14} />,
        amber: true,
        onClick: () => { setContextMenu(null); handleReprintLabel(fileId); },
      });
    }
    if (items.length > 0) items.push({ id: "sep-top", separator: true });

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

    items.push({ id: "sep-1", separator: true });

    if (canAdvance && batchPath) {
      items.push({
        id: "rollback",
        label: isBulk ? `Rollback ${selectedFileIds.size} to inbox` : "Rollback to inbox",
        icon: <LuCornerUpLeft size={14} />,
        danger: true,
        children: reasonDefinitions.map((reason) => {
          const Icon = resolveIcon(reason.iconName);
          return {
            id: `rollback-${reason.code}`,
            label: reason.label,
            icon: Icon ? <Icon size={14} /> : null,
            onClick: async () => {
              if (isBulk) {
                if (reason.code === "OTHER") {
                  setOtherReasonText("");
                  setOtherReasonTarget({ action: "bulk-rollback" });
                  return;
                }
                await handleBulkRollback({ code: reason.code, label: reason.label });
              } else {
                if (reason.code === "OTHER") {
                  setOtherReasonText("");
                  setOtherReasonTarget({ fileId, batchPath, action: "rollback" });
                  return;
                }
                await handleRollbackWithReason(fileId, batchPath, { code: reason.code, label: reason.label });
              }
            },
          };
        }),
      });
    }

    if (canAdvance && isAtQC) {
      items.push({
        id: "sewing",
        label: "Send to Sewing",
        icon: <LuScissors size={14} />,
        onClick: () => { setContextMenu(null); handleSewing(fileId); },
      });
    }

    return items;
  }, [contextMenu, selectedFileIds, reasonDefinitions, productionStages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={style.container}>

      <div className={style.topbar}>
        <h2 className={style.title}>Production</h2>
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

        <div className={style.topbar_right}>
          <div className={style.search_wrapper}>
            <HiMagnifyingGlass className={style.search_icon} />
            <input
              className={style.search_input}
              placeholder="Search order ID or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className={style.refresh_btn} onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? <span className={style.spinner} /> : <HiArrowPath />}
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className={style.icon_btn_danger} title="Clear all production data" onClick={handleClearAll}>
            <LuTrash2 size={15} />
          </button>
        </div>
      </div>

      {batchFilter && (
        <div className={style.filter_bar}>
          <span className={style.filter_bar_label}>Batch</span>
          <button type="button" className={style.batch_chip} onClick={() => setBatchFilter(null)}>
            {batchFilter.split(/[/\\]/).pop()} ×
          </button>
        </div>
      )}

      {selectedFileIds.size > 0 && (
        <div className={style.selection_bar}>
          <span className={style.selection_count}>{selectedFileIds.size} selected</span>
        </div>
      )}

      <div className={style.cards_wrapper}>
        {isLoading && allRows.length === 0 ? (
          <div className={style.loading_state}>
            <div className={style.loading_spinner} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={style.empty_state}>
            <span className={style.empty_text}>No jobs match the current filter.</span>
          </div>
        ) : (
          filtered.map((row) => (
            <ProductionCard
              key={row.file_id}
              stage={row}
              history={stageHistory[row.file_id] ?? []}
              highlighted={highlightedId === row.file_id}
              selected={selectedFileIds.has(row.file_id)}
              onSelect={toggleProductionSelect}
              onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
            />
          ))
        )}
      </div>

      {/* QC modal */}
      {qcModalOpen && qcModalBatch && (
        <QCModal
          batchPath={qcModalBatch.batchPath}
          files={qcModalBatch.files}
          onConfirm={handleQcConfirm}
          onClose={() => setQcModalOpen(false)}
        />
      )}

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
          onClose={() => { setContextMenu(null); clearProductionSelection(); }}
          options={contextMenuOptions}
        />,
        document.body,
      )}

      {/* Other reason modal */}
      {otherReasonTarget && createPortal(
        <>
          <div className={style.backdrop} onClick={() => setOtherReasonTarget(null)} />
          <div className={style.modal}>
            <h3 className={style.modal_title}>Describe the issue:</h3>
            <input
              className={style.other_input}
              placeholder="Enter reason..."
              value={otherReasonText}
              onChange={(e) => setOtherReasonText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOtherReasonTarget(null);
                if (e.key === "Enter" && otherReasonText.trim()) {
                  const { fileId, batchPath, action } = otherReasonTarget;
                  const reason = { code: "OTHER", label: otherReasonText.trim() };
                  setOtherReasonTarget(null);
                  if (action === "bulk-rollback") handleBulkRollback(reason);
                  else handleRollbackWithReason(fileId, batchPath, reason);
                }
              }}
              autoFocus
            />
            <div className={style.modal_footer}>
              <button type="button" className={style.modal_cancel} onClick={() => setOtherReasonTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={style.modal_confirm}
                disabled={!otherReasonText.trim()}
                onClick={() => {
                  const { fileId, batchPath, action } = otherReasonTarget;
                  const reason = { code: "OTHER", label: otherReasonText.trim() };
                  setOtherReasonTarget(null);
                  if (action === "bulk-rollback") handleBulkRollback(reason);
                  else handleRollbackWithReason(fileId, batchPath, reason);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

    </div>
  );
};

export default Production;
