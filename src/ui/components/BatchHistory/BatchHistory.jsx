import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notify } from "../../utils/notify";
import { useStore } from "../../store/useStore";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import RollbackModal from "../RollbackModal/RollbackModal";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { resolveIcon } from "../../constants/rollbackReasonIcons";
import BatchRow from "./BatchRow";
import gsap from "gsap";
import { LuRefreshCw, LuEye, LuCornerUpLeft, LuFolderOpen, LuChevronsDownUp, LuChevronDown, LuChevronRight } from "react-icons/lu";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import style from "./BatchHistory.module.css";
import { BATCH_STATUS, FILE_STATUS, PRINTER } from "../../../shared/constants";
import {
  readPrintedFolder,
  getRollbackReasonsByBatch,
  startBatchWatcher,
  stopBatchWatcher,
  onBatchUpdate,
  rollbackFile as rollbackFileApi,
  rollbackBatch as rollbackBatchApi,
  deleteBatch as deleteBatchApi,
  regenerateXml as regenerateXmlApi,
} from "../../services/batchService";
import { openPreview as openPreviewApi, openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { showConfirm } from "../../services/systemService";

const PRINTERS = Object.values(PRINTER);

const parseDayFromBatchPath = (batchPath) => {
  const parts = batchPath.replace(/\\/g, "/").split("/");
  return parts.length >= 2 ? parts[parts.length - 2] : null;
};

const BatchHistory = () => {
  const setBatchDays = useStore((state) => state.setBatchDays);
  const reasonDefinitions = useStore((state) => state.reasonDefinitions);
  const [dayGroups, setDayGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePrinters, setActivePrinters] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [rollbackModal, setRollbackModal] = useState(null);
  const [otherReasonTarget, setOtherReasonTarget] = useState(null);
  const [otherReasonText, setOtherReasonText] = useState("");

  const pendingAnimationsRef = useRef(new Set());
  const elementRefsRef = useRef(new Map());
  const isInitialLoadRef = useRef(true);
  const searchInputRef = useRef(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await readPrintedFolder();
      if (res.success) {
        const daysWithReasons = await Promise.all(
          res.data.map(async (day) => ({
            ...day,
            batches: await Promise.all(
              day.batches.map(async (batch) => {
                const needsReasons =
                  batch.status === BATCH_STATUS.ROLLED_BACK || batch.files?.some((f) => f.status === FILE_STATUS.ROLLED_BACK);
                if (!needsReasons) return batch;
                const reasonsRes = await getRollbackReasonsByBatch(batch.path);
                return { ...batch, rollbackReasons: reasonsRes?.data ?? [] };
              }),
            ),
          })),
        );
        setDayGroups(daysWithReasons);
        if (isInitialLoadRef.current) {
          const todayGroup = daysWithReasons.find((d) => d.label === "Today");
          if (todayGroup) {
            setExpandedDays(new Set([todayGroup.date]));
          }
          isInitialLoadRef.current = false;
        }
      } else {
        const err = res.errors?.[0];
        notify(
          {
            type: err?.type || "Error",
            title: err?.title || "Failed to load batch history",
            message: err?.message || "Could not read the PRINTED folder.",
          },
          { stage: "readFolders", code: "READ_BATCH_HISTORY_FAILED" },
        );
      }
    } catch (err) {
      notify(
        {
          type: "Error",
          title: "Failed to load batch history",
          message: err?.message || "An unexpected error occurred.",
        },
        { stage: "readFolders", code: "READ_BATCH_HISTORY_EXCEPTION" },
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleBatchUpdate = useCallback(async (payload) => {
    const { type, batch, batchPath, file } = payload;

    if (type === "new-batch") {
      pendingAnimationsRef.current.add(`batch:${batch.path}`);
      setDayGroups((prev) => {
        const dayFolder = parseDayFromBatchPath(batch.path);
        const existingDayIdx = prev.findIndex((d) => d.date === dayFolder);

        if (existingDayIdx >= 0) {
          const updated = [...prev];
          const day = updated[existingDayIdx];
          const existsBatch = day.batches.find((b) => b.path === batch.path);
          const newBatches = existsBatch
            ? day.batches.map((b) => {
                if (b.path !== batch.path) return b;
                return { ...batch, rollbackReasons: batch.rollbackReasons ?? b.rollbackReasons };
              })
            : [...day.batches, batch];
          updated[existingDayIdx] = {
            ...day,
            batches: newBatches,
            totalBatches: newBatches.length,
            totalFiles: newBatches.reduce((s, b) => s + b.fileCount, 0),
          };
          return updated;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        let label = null;
        if (dayFolder) {
          const [d, m, y] = dayFolder.split("-").map(Number);
          const date = new Date(y, m - 1, d);
          date.setHours(0, 0, 0, 0);
          if (date.getTime() === today.getTime()) label = "Today";
          else if (date.getTime() === yesterday.getTime()) label = "Yesterday";
        }

        const newDay = { date: dayFolder, label, totalBatches: 1, totalFiles: batch.fileCount, batches: [batch] };
        return [newDay, ...prev].sort((a, b) => {
          const [ad, am, ay] = a.date.split("-").map(Number);
          const [bd, bm, by] = b.date.split("-").map(Number);
          return new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad);
        });
      });
    } else if (type === "new-file") {
      pendingAnimationsRef.current.add(`file:${file.path}`);
      setDayGroups((prev) =>
        prev.map((day) => ({
          ...day,
          batches: day.batches.map((b) => {
            if (b.path !== batchPath) return b;
            if (b.files.some((f) => f.path === file.path)) return b;
            const newFiles = [...b.files, file];
            return { ...b, files: newFiles, fileCount: newFiles.length, status: BATCH_STATUS.ACTIVE };
          }),
          totalFiles: day.batches.reduce((s, b) => {
            if (b.path !== batchPath) return s + b.fileCount;
            const already = b.files.some((f) => f.path === file.path);
            return s + (already ? b.fileCount : b.fileCount + 1);
          }, 0),
        })),
      );
    } else if (type === "removed") {
      let rollbackReasons = [];
      try {
        const reasonsRes = await getRollbackReasonsByBatch(batchPath);
        rollbackReasons = reasonsRes?.data ?? [];
      } catch (err) { console.error("[BatchHistory] getRollbackReasonsByBatch failed:", err); }
      setDayGroups((prev) =>
        prev.map((day) => ({
          ...day,
          batches: day.batches.map((b) =>
            b.path === batchPath ? { ...b, status: BATCH_STATUS.ROLLED_BACK, fileCount: 0, files: [], rollbackReasons } : b,
          ),
          totalFiles: day.batches.reduce((s, b) => s + (b.path === batchPath ? 0 : b.fileCount), 0),
        })),
      );
    }
  }, []);

  useEffect(() => {
    loadData();
    startBatchWatcher();
    const cleanup = onBatchUpdate(handleBatchUpdate);
    return () => {
      stopBatchWatcher();
      cleanup();
    };
  }, [loadData, handleBatchUpdate]);

  useEffect(() => {
    setBatchDays(dayGroups);
  }, [dayGroups, setBatchDays]);

  // Animate new items after state update
  useEffect(() => {
    if (pendingAnimationsRef.current.size === 0) return;
    pendingAnimationsRef.current.forEach((key) => {
      const el = elementRefsRef.current.get(key);
      if (el) {
        const duration = key.startsWith("file:") ? 0.2 : 0.3;
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration, ease: "power1.out" });
      }
    });
    pendingAnimationsRef.current.clear();
  }, [dayGroups]);

  const togglePrinterFilter = (printer) => {
    setActivePrinters((prev) => {
      const next = new Set(prev);
      if (next.has(printer)) next.delete(printer);
      else next.add(printer);
      return next;
    });
  };

  const toggleDay = (date) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleBatch = (batchPath) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchPath)) next.delete(batchPath);
      else next.add(batchPath);
      return next;
    });
  };


  const filteredDayGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return dayGroups
      .map((day) => {
        const filteredBatches = day.batches
          .filter((batch) => {
            if (activePrinters.size > 0 && !activePrinters.has(batch.printer)) return false;
            if (!q) return true;
            const matchesBatch = batch.name.toLowerCase().includes(q);
            const matchesFile = batch.files.some((f) => f.name.toLowerCase().includes(q));
            return matchesBatch || matchesFile;
          })
          .map((batch) => {
            if (!q || batch.name.toLowerCase().includes(q)) return batch;
            return {
              ...batch,
              files: batch.files.filter((f) => f.name.toLowerCase().includes(q)),
              _fileSearch: true,
            };
          });

        return { ...day, batches: filteredBatches };
      })
      .filter((day) => day.batches.length > 0);
  }, [dayGroups, searchQuery, activePrinters]);

  const handleOpenPreview = useCallback(async (filePath) => {
    try {
      const res = await openPreviewApi(filePath);
      if (!res?.success) {
        const err = res?.errors?.[0];
        throw {
          type: err?.type || "Error",
          title: err?.title || "Preview failed",
          message: err?.message || "Could not open file.",
        };
      }
    } catch (err) {
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "Preview failed",
          message: err?.message || "Could not open file.",
        },
        { stage: "app", code: "OPEN_PREVIEW_FAILED" },
      );
    }
  }, []);

  const handleOpenInFolder = useCallback(async (filePath) => {
    try {
      const res = await openInFolderApi(filePath);
      if (!res?.success) {
        const err = res?.errors?.[0];
        throw {
          type: err?.type || "Error",
          title: err?.title || "Open folder failed",
          message: err?.message || "Could not open folder.",
        };
      }
    } catch (err) {
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "Open folder failed",
          message: err?.message || "Could not open folder.",
        },
        { stage: "app", code: "OPEN_FOLDER_FAILED" },
      );
    }
  }, []);

  const handleOpenInShopify = useCallback(async (file) => {
    const orderId = file.orderId ?? file.name.match(/ON\d+/i)?.[0]?.toUpperCase() ?? null;
    if (!orderId) {
      notify(
        { type: "Warning", title: "No order number", message: "No order number for this file." },
        { stage: "app", code: "SHOPIFY_NO_ORDER_ID" },
      );
      return;
    }
    const res = await openInShopifyApi(orderId);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "Open in Shopify failed",
          message: err?.message || "Could not open Shopify order.",
        },
        { stage: "app", code: "OPEN_SHOPIFY_FAILED" },
      );
    }
  }, []);

  const handleRollbackFile = useCallback(
    async (filePath, batchPath, reason) => {
      try {
        const res = await rollbackFileApi({ filePath, batchPath, reason });
        if (res?.success) {
          notify(
            { type: "Success", title: "File rolled back", message: "The file has been moved back to the inbox." },
            { stage: "rollback", code: "FILE_ROLLED_BACK", detail: { filePath, batchPath } },
          );
          const fileName = filePath.replace(/\\/g, "/").split("/").pop();
          const fileId = fileName.replace(/\.[^.]+$/, "");
          setDayGroups((prev) =>
            prev.map((day) => ({
              ...day,
              batches: day.batches.map((b) => {
                if (b.path !== batchPath) return b;
                return {
                  ...b,
                  files: b.files.map((f) =>
                    f.path === filePath
                      ? { ...f, status: FILE_STATUS.ROLLED_BACK, rolledBackAt: new Date().toISOString() }
                      : f,
                  ),
                  rollbackReasons: [
                    ...(b.rollbackReasons ?? []),
                    { file_id: fileId, reason_code: reason.code, reason_label: reason.label },
                  ],
                };
              }),
            })),
          );
          searchInputRef.current?.focus();
        } else {
          const err = res?.errors?.[0];
          throw {
            type: err?.type || "Error",
            title: err?.title || "Rollback failed",
            message: err?.message || "Could not roll back file.",
          };
        }
      } catch (err) {
        notify(
          {
            type: err?.type || "Error",
            title: err?.title || "Rollback failed",
            message: err?.message || "Could not roll back file.",
          },
          { stage: "rollback", code: "FILE_ROLLBACK_FAILED" },
        );
      }
    },
    [],
  );

  const handleConfirmRollbackBatch = useCallback(
    async (reason) => {
      if (!rollbackModal) return;
      const { batchPath } = rollbackModal;
      setRollbackModal(null);
      try {
        const res = await rollbackBatchApi({ batchPath, reason });
        if (res?.success) {
          notify(
            { type: "Success", title: "Batch rolled back", message: "All files have been moved back to the inbox." },
            { stage: "rollback", code: "BATCH_ROLLED_BACK", detail: { batchPath } },
          );
          setDayGroups((prev) =>
            prev.map((day) => ({
              ...day,
              batches: day.batches.map((b) => {
                if (b.path !== batchPath) return b;
                return {
                  ...b,
                  status: BATCH_STATUS.ROLLED_BACK,
                  fileCount: 0,
                  files: [],
                  rollbackReasons: [{ file_id: null, reason_code: reason.code, reason_label: reason.label }],
                };
              }),
              totalFiles: day.batches.reduce((s, b) => s + (b.path === batchPath ? 0 : b.fileCount), 0),
            })),
          );
          searchInputRef.current?.focus();
        } else {
          const err = res?.errors?.[0];
          throw {
            type: err?.type || "Error",
            title: err?.title || "Rollback failed",
            message: err?.message || "Could not roll back batch.",
          };
        }
      } catch (err) {
        notify(
          {
            type: err?.type || "Error",
            title: err?.title || "Rollback failed",
            message: err?.message || "Could not roll back batch.",
          },
          { stage: "rollback", code: "BATCH_ROLLBACK_FAILED" },
        );
      }
    },
    [rollbackModal],
  );

  const handleDeleteBatch = useCallback(async (batchPath) => {
    if (!(await showConfirm("Permanently delete this empty batch folder? This cannot be undone."))) return;
    try {
      const res = await deleteBatchApi(batchPath);
      if (res?.success) {
        notify(
          { type: "Success", title: "Batch deleted", message: "The empty batch folder has been deleted." },
          { stage: "app", code: "BATCH_DELETED", detail: { batchPath } },
        );
        setDayGroups((prev) =>
          prev
            .map((day) => ({ ...day, batches: day.batches.filter((b) => b.path !== batchPath) }))
            .filter((day) => day.batches.length > 0),
        );
        searchInputRef.current?.focus();
      } else {
        const err = res?.errors?.[0];
        throw {
          type: err?.type || "Error",
          title: err?.title || "Delete failed",
          message: err?.message || "Could not delete batch.",
        };
      }
    } catch (err) {
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "Delete failed",
          message: err?.message || "Could not delete batch.",
        },
        { stage: "app", code: "BATCH_DELETE_FAILED" },
      );
    }
  }, []);

  const handleRegenerateXml = useCallback(async (batchPath) => {
    try {
      const res = await regenerateXmlApi(batchPath);
      if (res?.success) {
        notify(
          { type: "Success", title: "XML regenerated", message: "The batch XML has been regenerated." },
          { stage: "createXML", code: "XML_REGENERATED", detail: { batchPath } },
        );
      } else {
        const err = res?.errors?.[0];
        throw {
          type: err?.type || "Error",
          title: err?.title || "XML regeneration failed",
          message: err?.message || "Could not regenerate XML.",
        };
      }
    } catch (err) {
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "XML regeneration failed",
          message: err?.message || "Could not regenerate XML.",
        },
        { stage: "createXML", code: "XML_REGEN_FAILED" },
      );
    }
  }, []);

  const {
    openPreview,
    closePreview,
    navigate: navigatePreview,
    isOpen: isPreviewOpen,
    isLoading: isPreviewLoading,
    imgSrc: previewImgSrc,
    error: previewError,
    currentPath: previewCurrentPath,
    currentIndex: previewCurrentIndex,
    fileList: previewFileList,
  } = usePdfPreview();

  const activeContextFilePath = contextMenu?.file?.path || null;

  return (
    <div className={style.container}>
      <div className={style.topbar}>
        <h2 className={style.title}>Batch history</h2>
        <div className={style.search_wrapper}>
          <HiMagnifyingGlass className={style.search_icon} />
          <input
            ref={searchInputRef}
            className={style.search_input}
            type="text"
            placeholder="Search batches or files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={style.search_clear}
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
            >
              <HiXMark />
            </button>
          )}
        </div>
        <div className={style.separator} />
        <div className={style.printer_filters}>
          {PRINTERS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${style.printer_btn} ${activePrinters.has(p) ? style.printer_btn_active : ""}`}
              onClick={() => togglePrinterFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={style.collapse_btn}
          title="Collapse all"
          onClick={() => {
            setExpandedDays(new Set());
            setExpandedBatches(new Set());
          }}
        >
          <LuChevronsDownUp size={15} />
        </button>
        <button type="button" className={style.refresh_btn} onClick={loadData} disabled={isLoading}>
          <LuRefreshCw size={15} className={isLoading ? style.spinning_icon : ""} />
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className={style.tree}>
        {isLoading && dayGroups.length === 0 && (
          <div className={style.loading_state}>
            <div className={style.loading_spinner} />
          </div>
        )}

        {filteredDayGroups.length === 0 && !isLoading && (
          <div className={style.empty_state}>
            <span className={style.empty_state_text}>
              {searchQuery || activePrinters.size > 0 ? "No results found." : "No batches yet."}
            </span>
          </div>
        )}

        {filteredDayGroups.map((day) => {
          const isDayExpanded = expandedDays.has(day.date);

          return (
            <div key={day.date} className={style.day_group}>
              <button type="button" className={style.day_row} onClick={() => toggleDay(day.date)}>
                <span className={style.chevron}>
                  {isDayExpanded ? <LuChevronDown size={18} /> : <LuChevronRight size={18} />}
                </span>
                <span className={style.day_date}>{day.date}</span>
                {day.label && <span className={style.day_label}>{day.label}</span>}
                <span className={style.day_pill}>
                  {day.totalBatches} {day.totalBatches === 1 ? "batch" : "batches"} · {day.totalFiles} files
                </span>
              </button>

              {isDayExpanded && (
                <div className={style.day_batches}>
                  {day.batches.map((batch) => (
                    <BatchRow
                      key={batch.path}
                      batch={batch}
                      isBatchExpanded={expandedBatches.has(batch.path)}
                      onToggle={toggleBatch}
                      onRegenerateXml={handleRegenerateXml}
                      onOpenInFolder={handleOpenInFolder}
                      onSetRollbackModal={setRollbackModal}
                      onDeleteBatch={handleDeleteBatch}
                      onContextMenu={(file, batch, x, y) => setContextMenu({ file, batch, x, y })}
                      elementRefsRef={elementRefsRef}
                      activeContextFilePath={activeContextFilePath}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {contextMenu &&
        createPortal(
          <ContextMenu
            id="batch-history-context-menu"
            anchorX={contextMenu.x}
            anchorY={contextMenu.y}
            onClose={() => setContextMenu(null)}
            options={[
              {
                id: "preview",
                label: "Quick Preview",
                icon: <LuEye />,
                onClick: () => {
                  const { file, batch } = contextMenu;
                  setContextMenu(null);
                  const batchFileList = batch.files
                    .filter((f) => f.status !== FILE_STATUS.ROLLED_BACK)
                    .map((f) => ({ path: f.path, name: f.name }));
                  openPreview(file.path, batchFileList);
                },
              },
              {
                id: "folder",
                label: "Open in Folder",
                icon: <LuFolderOpen />,
                onClick: async () => {
                  const { file } = contextMenu;
                  setContextMenu(null);
                  await handleOpenInFolder(file.path);
                },
              },
              {
                id: "shopify",
                label: "Open in Shopify",
                onClick: async () => {
                  const { file } = contextMenu;
                  setContextMenu(null);
                  await handleOpenInShopify(file);
                },
              },
              { id: "sep-1", separator: true },
              {
                id: "rollback-file",
                label: "Rollback this file",
                icon: <LuCornerUpLeft />,
                danger: true,
                children: (() => {
                  const makeItem = (reason) => {
                    const Icon = resolveIcon(reason.iconName);
                    return {
                      id: `rollback-${reason.code}`,
                      label: reason.label,
                      icon: Icon ? <Icon size={14} /> : null,
                      onClick: async () => {
                        const { file, batch } = contextMenu;
                        if (reason.code === "OTHER") {
                          setOtherReasonText("");
                          setOtherReasonTarget({ file, batch });
                          return;
                        }
                        await handleRollbackFile(file.path, batch.path, { code: reason.code, label: reason.label });
                      },
                    };
                  };
                  const others = reasonDefinitions.filter((r) => r.code === "OTHER");
                  const rest = reasonDefinitions.filter((r) => r.code !== "OTHER");
                  return [
                    ...rest.map(makeItem),
                    ...(others.length > 0 ? [{ id: "sep-other", separator: true }, ...others.map(makeItem)] : []),
                  ];
                })(),
              },
            ]}
          />,
          document.body,
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
      {rollbackModal && (
        <RollbackModal
          batchName={rollbackModal.batchName}
          onConfirm={handleConfirmRollbackBatch}
          onCancel={() => setRollbackModal(null)}
        />
      )}
      {otherReasonTarget &&
        createPortal(
          <>
            <div
              className={style.other_reason_backdrop}
              onClick={() => setOtherReasonTarget(null)}
            />
            <div className={style.other_reason_modal}>
              <p className={style.other_reason_title}>Describe the issue:</p>
              <input
                className={style.other_reason_input}
                type="text"
                placeholder="Enter reason..."
                value={otherReasonText}
                onChange={(e) => setOtherReasonText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOtherReasonTarget(null);
                  if (e.key === "Enter" && otherReasonText.trim()) {
                    const { file, batch } = otherReasonTarget;
                    setOtherReasonTarget(null);
                    handleRollbackFile(file.path, batch.path, { code: "OTHER", label: otherReasonText.trim() });
                  }
                }}
                autoFocus
              />
              <p className={style.other_reason_hint}>before typing, make sure the reason you want to describe doesn&apos;t already exist in the options above.</p>
              <div className={style.other_reason_actions}>
                <button
                  type="button"
                  className={style.other_reason_cancel}
                  onClick={() => setOtherReasonTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={style.other_reason_confirm}
                  disabled={!otherReasonText.trim()}
                  onClick={() => {
                    const { file, batch } = otherReasonTarget;
                    setOtherReasonTarget(null);
                    handleRollbackFile(file.path, batch.path, { code: "OTHER", label: otherReasonText.trim() });
                  }}
                >
                  Rollback
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
};

export default BatchHistory;
