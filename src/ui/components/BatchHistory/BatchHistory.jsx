import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notify } from "../../utils/notify";
import { useStore } from "../../store/useStore";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import RollbackModal from "../RollbackModal/RollbackModal";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { ROLLBACK_REASONS } from "../../constants/rollbackReasons";
import gsap from "gsap";
import {
  LuRefreshCw,
  LuFolderOpen,
  LuEye,
  LuCornerUpLeft,
  LuChevronRight,
  LuChevronDown,
  LuFileText,
  LuTrash2,
  LuChevronsDownUp,
} from "react-icons/lu";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import style from "./BatchHistory.module.css";
import { PRINTER_COLORS } from "../../constants/printerColors";

const PRINTERS = ["DGEN", "YOKO", "YUMI"];

const formatRolledBackAt = (isoString) => {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${dd}/${mo}`;
};

const parseDayFromBatchPath = (batchPath) => {
  const parts = batchPath.replace(/\\/g, "/").split("/");
  return parts.length >= 2 ? parts[parts.length - 2] : null;
};

const BatchHistory = () => {
  const setBatchDays = useStore((state) => state.setBatchDays);
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
      const res = await window.api.readPrintedFolder();
      if (res.success) {
        const daysWithReasons = await Promise.all(
          res.data.map(async (day) => ({
            ...day,
            batches: await Promise.all(
              day.batches.map(async (batch) => {
                if (batch.status !== "rolled_back") return batch;
                const reasonsRes = await window.api.getRollbackReasonsByBatch(batch.path);
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
            ? day.batches.map((b) => (b.path === batch.path ? batch : b))
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
            return { ...b, files: newFiles, fileCount: newFiles.length, status: "active" };
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
        const reasonsRes = await window.api.getRollbackReasonsByBatch(batchPath);
        rollbackReasons = reasonsRes?.data ?? [];
      } catch {}
      setDayGroups((prev) =>
        prev.map((day) => ({
          ...day,
          batches: day.batches.map((b) =>
            b.path === batchPath ? { ...b, status: "rolled_back", fileCount: 0, files: [], rollbackReasons } : b,
          ),
          totalFiles: day.batches.reduce((s, b) => s + (b.path === batchPath ? 0 : b.fileCount), 0),
        })),
      );
    }
  }, []);

  useEffect(() => {
    loadData();
    window.api.startBatchWatcher();
    const cleanup = window.api.onBatchUpdate(handleBatchUpdate);
    return () => {
      window.api.stopBatchWatcher();
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
      const res = await window.api.openPreview(filePath);
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
      const res = await window.api.openInFolder(filePath);
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

  const handleRollbackFile = useCallback(
    async (filePath, batchPath, reason) => {
      try {
        const res = await window.api.rollbackFile({ filePath, batchPath, reason });
        if (res?.success) {
          notify(
            { type: "Success", title: "File rolled back", message: "The file has been moved back to the inbox." },
            { stage: "rollback", code: "FILE_ROLLED_BACK", detail: { filePath, batchPath } },
          );
          await loadData();
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
    [loadData],
  );

  const handleConfirmRollbackBatch = useCallback(
    async (reason) => {
      if (!rollbackModal) return;
      const { batchPath } = rollbackModal;
      setRollbackModal(null);
      try {
        const res = await window.api.rollbackBatch({ batchPath, reason });
        if (res?.success) {
          notify(
            { type: "Success", title: "Batch rolled back", message: "All files have been moved back to the inbox." },
            { stage: "rollback", code: "BATCH_ROLLED_BACK", detail: { batchPath } },
          );
          // Watcher fires "removed" event within 200ms — no manual loadData() needed here.
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
    if (!(await window.api.showConfirm("Permanently delete this empty batch folder? This cannot be undone."))) return;
    try {
      const res = await window.api.deleteBatch(batchPath);
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
      const res = await window.api.regenerateXml(batchPath);
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
                  {day.batches.map((batch) => {
                    const isBatchExpanded = expandedBatches.has(batch.path);
                    const showFiles = isBatchExpanded;
                    const isRolledBack = batch.status === "rolled_back";
                    const rolledBackCount = batch.files.filter((f) => f.status === "rolled_back").length;
                    const printerColors = PRINTER_COLORS[batch.printer] || { bg: "#f0f0f0", color: "#555" };

                    return (
                      <div
                        key={batch.path}
                        className={`${style.batch_group} ${isRolledBack ? style.batch_rolled_back : ""}`}
                        ref={(el) => {
                          if (el) elementRefsRef.current.set(`batch:${batch.path}`, el);
                          else elementRefsRef.current.delete(`batch:${batch.path}`);
                        }}
                      >
                        <div className={style.batch_row}>
                          <button
                            type="button"
                            className={style.batch_expand_btn}
                            onClick={() => toggleBatch(batch.path)}
                          >
                            {isBatchExpanded ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
                          </button>
                          <div className={style.batch_name_group}>
                            <span className={style.batch_name} title={batch.name}>
                              {batch.name}
                            </span>
                            {rolledBackCount > 0 && (
                              <span className={style.rolled_back_badge}>
                                {rolledBackCount} rolled back
                              </span>
                            )}
                          </div>
                          <span
                            className={style.printer_badge}
                            style={{ backgroundColor: printerColors.bg, color: printerColors.color }}
                          >
                            {batch.printer}
                          </span>
                          <span className={style.file_count}>
                            {batch.fileCount} {batch.fileCount === 1 ? "file" : "files"}
                            {batch.printLengthM > 0 && ` · ${batch.printLengthM} m`}
                          </span>
                          <span
                            className={style.xml_dot}
                            style={{ backgroundColor: batch.xmlExists ? "#639922" : "#E24B4A" }}
                            title={batch.xmlExists ? "XML exists" : "XML missing"}
                          />
                          <div className={style.batch_actions}>
                            {!isRolledBack && (
                              <>
                                <button
                                  type="button"
                                  className={`${style.action_btn} ${style.action_success}`}
                                  title="Regenerate XML"
                                  onClick={() => handleRegenerateXml(batch.path)}
                                >
                                  <LuRefreshCw size={16} />
                                </button>
                                <button
                                  type="button"
                                  className={`${style.action_btn} ${style.action_info}`}
                                  title="Open in Explorer"
                                  onClick={() => handleOpenInFolder(batch.path)}
                                >
                                  <LuFolderOpen size={16} />
                                </button>
                                <button
                                  type="button"
                                  className={`${style.action_btn} ${style.action_danger}`}
                                  title="Rollback batch"
                                  onClick={() => setRollbackModal({ batchName: batch.name, batchPath: batch.path })}
                                >
                                  <LuCornerUpLeft size={16} />
                                </button>
                              </>
                            )}
                            {isRolledBack && (
                              <button
                                type="button"
                                className={`${style.action_btn} ${style.action_danger}`}
                                title="Delete empty batch folder"
                                onClick={() => handleDeleteBatch(batch.path)}
                              >
                                <LuTrash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>

                        {showFiles && batch.files.length > 0 && (
                          <ul className={style.batch_files}>
                            {batch.files.map((file) => {
                              const isFileRolledBack = file.status === "rolled_back";
                              const fileId = file.name.replace(/\.[^.]+$/, "");
                              const rollbackReason = isFileRolledBack
                                ? (batch.rollbackReasons?.find((r) => r.file_id === fileId) ??
                                   batch.rollbackReasons?.find((r) => r.file_id === null))
                                : null;
                              return (
                                <li
                                  key={file.path}
                                  className={`${style.file_row} ${activeContextFilePath === file.path ? style.file_row_active : ""} ${isFileRolledBack ? style.file_row_rolled_back : ""}`}
                                  onContextMenu={
                                    isFileRolledBack
                                      ? undefined
                                      : (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setContextMenu({ file, batch, x: e.clientX, y: e.clientY });
                                        }
                                  }
                                  ref={(el) => {
                                    if (el) elementRefsRef.current.set(`file:${file.path}`, el);
                                    else elementRefsRef.current.delete(`file:${file.path}`);
                                  }}
                                >
                                  <LuFileText className={style.file_icon} />
                                  <span className={style.file_name} title={file.name}>
                                    {file.name}
                                  </span>
                                  {isFileRolledBack && file.rolledBackAt && (
                                    <span className={style.file_rolled_back_label}>
                                      Rolled back {formatRolledBackAt(file.rolledBackAt)}
                                    </span>
                                  )}
                                  {rollbackReason && (
                                    <span className={style.reason_badge}>{rollbackReason.reason_label}</span>
                                  )}
                                  {!isFileRolledBack && file.type && file.type !== "UNKNOWN" && (
                                    <span className={style.type_badge}>{file.type}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
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
                    .filter((f) => f.status !== "rolled_back")
                    .map((f) => ({ path: f.path, name: f.name }));
                  openPreview(file.path, batchFileList);
                },
              },
              {
                id: "folder",
                label: "Show in Explorer",
                icon: <LuFolderOpen />,
                onClick: async () => {
                  const { file } = contextMenu;
                  setContextMenu(null);
                  await handleOpenInFolder(file.path);
                },
              },
              { id: "sep-1", separator: true },
              {
                id: "rollback-file",
                label: "Rollback this file",
                icon: <LuCornerUpLeft />,
                danger: true,
                children: ROLLBACK_REASONS.map((reason) => {
                  const Icon = reason.icon;
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
                    await handleRollbackFile(file.path, batch.path, reason);
                  },
                  };
                }),
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
