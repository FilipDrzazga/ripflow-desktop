import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notify } from "../../utils/notify";
import { useStore } from "../../store/useStore";
import ContextMenu from "../ContextMenu/ContextMenu";
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

  const pendingAnimationsRef = useRef(new Set());
  const elementRefsRef = useRef(new Map());
  const isInitialLoadRef = useRef(true);
  const searchInputRef = useRef(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.api.readPrintedFolder();
      if (res.success) {
        setDayGroups(res.data);
        if (isInitialLoadRef.current) {
          const todayGroup = res.data.find((d) => d.label === "Today");
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

  const handleBatchUpdate = useCallback((payload) => {
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
      setDayGroups((prev) =>
        prev.map((day) => ({
          ...day,
          batches: day.batches.map((b) =>
            b.path === batchPath ? { ...b, status: "rolled_back", fileCount: 0, files: [] } : b,
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

  // When search is active, auto-expand all days and batches so results are
  // immediately visible. useEffect (not useLayoutEffect) is intentional: sync
  // DOM mutations from useLayoutEffect can prevent focus from returning to the
  // search input after Electron's native confirm dialogs.
  useEffect(() => {
    if (!searchQuery.trim()) return;
    setExpandedDays((prev) => {
      const next = new Set(prev);
      dayGroups.forEach((d) => next.add(d.date));
      return next;
    });
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      dayGroups.forEach((d) => d.batches.forEach((b) => next.add(b.path)));
      return next;
    });
  }, [searchQuery, dayGroups]);

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
    async (filePath, batchPath) => {
      if (!(await window.api.showConfirm("Move this file back to the inbox? It will be available for printing again."))) return;
      try {
        const res = await window.api.rollbackFile(filePath, batchPath);
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

  const handleRollbackBatch = useCallback(
    async (batchPath) => {
      if (!(await window.api.showConfirm("Move all files in this batch back to the inbox? The XML will remain."))) return;
      try {
        const res = await window.api.rollbackBatch(batchPath);
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
    [loadData],
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
                          <span className={style.batch_name} title={batch.name}>
                            {batch.name}
                          </span>
                          <span
                            className={style.printer_badge}
                            style={{ backgroundColor: printerColors.bg, color: printerColors.color }}
                          >
                            {batch.printer}
                          </span>
                          <span className={style.file_count}>{batch.fileCount} files</span>
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
                                  onClick={() => handleRollbackBatch(batch.path)}
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
                            {batch.files.map((file) => (
                              <li
                                key={file.path}
                                className={`${style.file_row} ${activeContextFilePath === file.path ? style.file_row_active : ""}`}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setContextMenu({ file, batch, x: e.clientX, y: e.clientY });
                                }}
                                ref={(el) => {
                                  if (el) elementRefsRef.current.set(`file:${file.path}`, el);
                                  else elementRefsRef.current.delete(`file:${file.path}`);
                                }}
                              >
                                <LuFileText className={style.file_icon} />
                                <span className={style.file_name} title={file.name}>
                                  {file.name}
                                </span>
                                {file.type && file.type !== "UNKNOWN" && (
                                  <span className={style.type_badge}>{file.type}</span>
                                )}
                              </li>
                            ))}
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
                label: "Preview PDF",
                icon: <LuEye />,
                onClick: async () => {
                  const { file } = contextMenu;
                  setContextMenu(null);
                  await handleOpenPreview(file.path);
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
                onClick: async () => {
                  const { file, batch } = contextMenu;
                  setContextMenu(null);
                  await handleRollbackFile(file.path, batch.path);
                },
              },
            ]}
          />,
          document.body,
        )}
    </div>
  );
};

export default BatchHistory;
