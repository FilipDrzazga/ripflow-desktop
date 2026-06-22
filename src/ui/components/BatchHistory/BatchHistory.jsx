import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notify } from "../../utils/notify";
import { runMutation } from "../../utils/runMutation";
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
  readPrintedDays,
  readPrintedDay,
  getRollbackReasonsByBatch,
  startBatchWatcher,
  stopBatchWatcher,
  onBatchUpdate,
  rollbackFile as rollbackFileApi,
  rollbackBatch as rollbackBatchApi,
  deleteBatch as deleteBatchApi,
  regenerateXml as regenerateXmlApi,
} from "../../services/batchService";
import { openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { showConfirm } from "../../services/systemService";
import { getSettings } from "../../services/settingsService";
import { printBatchLabel } from "../../services/productionService";

const PRINTERS = Object.values(PRINTER);

const parseDayFromBatchPath = (batchPath) => {
  const parts = batchPath.replace(/\\/g, "/").split("/");
  return parts.length >= 2 ? parts[parts.length - 2] : null;
};

// Doczytuje rollbackReasons do batchy dnia (rolled_back batch lub batch z plikiem
// rolled_back). Wydzielone z loadData — reużywane przy lazy-load pojedynczego dnia.
const attachReasonsToDay = async (day) => ({
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
});

const BatchHistory = () => {
  const setBatchDays = useStore((state) => state.setBatchDays);
  const reasonDefinitions = useStore((state) => state.reasonDefinitions);
  const refreshFiles = useStore((state) => state.refreshFiles);
  const removeStageFromStore = useStore((state) => state.removeStageFromStore);
  const [dayGroups, setDayGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePrinters, setActivePrinters] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [loadingDays, setLoadingDays] = useState(new Set()); // dayFolder set — lazy-load in flight
  const [contextMenu, setContextMenu] = useState(null);
  const [rollbackModal, setRollbackModal] = useState(null);
  const [otherReasonTarget, setOtherReasonTarget] = useState(null);
  const [otherReasonText, setOtherReasonText] = useState("");

  const [canPrintLabel, setCanPrintLabel] = useState(false);

  // Multi-file selection for bulk rollback
  const [selectedFiles, setSelectedFiles] = useState(new Map()); // Map<filePath, batchPath>

  const pendingAnimationsRef = useRef(new Set());
  const elementRefsRef = useRef(new Map());
  const isInitialLoadRef = useRef(true);
  const searchInputRef = useRef(null);
  const pollFallbackRef = useRef(null); // setInterval id — only set while in degraded (watcher-down) mode
  const dayGroupsRef = useRef([]); // mirror of dayGroups for stale-free reads in degraded poll
  const loadAllRunningRef = useRef(false); // true while load-all-on-search is loading skeleton days

  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) setCanPrintLabel(!!res.settings.labelPrinterName);
    });
  }, []);

  const handlePrintLabel = useCallback(async (batchName, totalMeters) => {
    const res = await printBatchLabel({ batchName, totalMeters: totalMeters ?? null });
    if (res?.success) {
      notify({ type: "Success", title: "Label sent", message: `Label for ${batchName} sent to printer.` });
    } else {
      notify(
        { type: "Error", title: "Print failed", message: res?.error || "Could not print label." },
        { stage: "printLabel", code: "PRINT_LABEL_FAILED" },
      );
    }
  }, []);

  const toggleFileSelect = useCallback((filePath, batchPath) => {
    setSelectedFiles((prev) => {
      const next = new Map(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.set(filePath, batchPath);
      return next;
    });
  }, []);

  const clearFileSelection = useCallback(() => setSelectedFiles(new Map()), []);

  // Declared before the handlers below — several of them list loadData in their deps
  // array, which is evaluated at render time (TDZ if loadData were declared later).
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const daysRes = await readPrintedDays();
      if (daysRes.success) {
        const skeletons = daysRes.data;

        // Eager-load only the most recent N days (search is mostly the last week);
        // older days stay as skeletons and load on demand when expanded.
        let eagerDays = 7;
        try {
          const s = await getSettings();
          const n = s.success ? Math.floor(Number(s.settings.batchHistoryEagerDays)) : NaN;
          if (Number.isFinite(n) && n >= 1) eagerDays = n;
        } catch { /* keep default 7 */ }

        const loadedHead = await Promise.all(
          skeletons.slice(0, eagerDays).map(async (sk) => {
            const dayRes = await readPrintedDay(sk.dayFolder);
            if (!dayRes.success || !dayRes.data) return sk; // I/O fail → keep skeleton, reloadable on expand
            return attachReasonsToDay(dayRes.data);
          }),
        );

        const merged = [...loadedHead, ...skeletons.slice(eagerDays)];
        setDayGroups(merged);
        if (isInitialLoadRef.current) {
          const todayGroup = merged.find((d) => d.label === "Today");
          if (todayGroup) {
            setExpandedDays(new Set([todayGroup.date]));
          }
          isInitialLoadRef.current = false;
        }
      } else {
        const err = daysRes.errors?.[0];
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

  // entries: [filePath, batchPath][] — snapshot taken at menu-click time, before
  // ContextMenu onClose clears selectedFiles (state is empty by the time the
  // OTHER modal confirms)
  const handleBulkRollback = useCallback(
    async (reason, entries) => {
      setSelectedFiles(new Map());
      let successCount = 0;
      let failCount = 0;
      let timedOut = 0;
      const succeededFiles = [];

      for (const [filePath, batchPath] of entries) {
        try {
          const res = await rollbackFileApi({ filePath, batchPath, reason });
          if (res?.success) {
            succeededFiles.push({ filePath, batchPath });
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

      if (succeededFiles.length > 0) {
        const now = new Date().toISOString();
        setDayGroups((prev) =>
          prev.map((day) => ({
            ...day,
            batches: day.batches.map((b) => {
              const batchSucceeded = succeededFiles.filter((e) => e.batchPath === b.path);
              if (batchSucceeded.length === 0) return b;
              const succeededPaths = new Set(batchSucceeded.map((e) => e.filePath));
              const newReasons = batchSucceeded.map(({ filePath: fp }) => {
                const fileName = fp.replace(/\\/g, "/").split("/").pop();
                const fid = fileName.replace(/\.[^.]+$/, "");
                return { file_id: fid, reason_code: reason.code, reason_label: reason.label };
              });
              return {
                ...b,
                files: b.files.map((f) =>
                  succeededPaths.has(f.path) ? { ...f, status: FILE_STATUS.ROLLED_BACK, rolledBackAt: now } : f,
                ),
                rollbackReasons: [...(b.rollbackReasons ?? []), ...newReasons],
              };
            }),
          })),
        );
        succeededFiles.forEach(({ filePath: fp }) => {
          const fn = fp.replace(/\\/g, "/").split("/").pop();
          removeStageFromStore(fn.replace(/\.[^.]+$/, ""));
        });
        refreshFiles();
      }

      // Once, after the loop: in-progress ops get a single warning + one state refresh.
      if (timedOut > 0) {
        notify(
          { type: "Warning", title: "Operations still in progress", message: `${timedOut} operation(s) taking longer than expected — refreshing state.` },
          { stage: "rollback", code: "FILES_ROLLBACK_TIMEOUT" },
        );
        await refreshFiles();
        loadData();
      }

      if (failCount === 0 && successCount > 0) {
        notify(
          { type: "Success", title: "Files rolled back", message: `${successCount} file(s) returned to inbox.` },
          { stage: "rollback", code: "FILES_ROLLED_BACK" },
        );
      } else if (successCount > 0) {
        notify(
          { type: "Warning", title: "Partially rolled back", message: `${successCount} succeeded, ${failCount} failed.` },
          { stage: "rollback", code: "FILES_ROLLBACK_PARTIAL" },
        );
      } else if (failCount > 0) {
        notify(
          { type: "Error", title: "Rollback failed", message: `${failCount} file(s) could not be rolled back.` },
          { stage: "rollback", code: "FILES_ROLLBACK_FAILED" },
        );
      }
    },
    [refreshFiles, loadData, removeStageFromStore],
  );

  // Degraded-mode refresh: re-read ONLY already-loaded days (skeletons reload on
  // expand). Never falls back to the full PRINTED scan — that would undo lazy-load.
  const reloadLoadedDays = useCallback(async () => {
    const loaded = dayGroupsRef.current.filter((d) => d.loaded === true);
    for (const day of loaded) {
      try {
        const dayRes = await readPrintedDay(day.dayFolder);
        if (dayRes.success && dayRes.data) {
          const withReasons = await attachReasonsToDay(dayRes.data);
          setDayGroups((prev) => prev.map((d) => (d.dayFolder === day.dayFolder ? withReasons : d)));
        }
      } catch (err) {
        console.error("[BatchHistory] reloadLoadedDays failed:", err);
      }
    }
  }, []);

  const handleBatchUpdate = useCallback(async (payload) => {
    const { type, batch, batchPath, file } = payload;

    if (type === "watcher-error") {
      if (pollFallbackRef.current) return; // already degraded — don't stack notify/interval
      notify(
        {
          type: "Warning",
          title: "Live updates paused",
          message: "Lost the real-time connection — refreshing periodically until it recovers.",
        },
        { stage: "watcher", code: "WATCHER_DEGRADED" },
      );
      pollFallbackRef.current = setInterval(() => { reloadLoadedDays(); }, 20000);
      return;
    }

    // Any healthy event means the watcher is alive again — leave degraded mode.
    if (pollFallbackRef.current) {
      clearInterval(pollFallbackRef.current);
      pollFallbackRef.current = null;
      notify(
        {
          type: "Success",
          title: "Live updates resumed",
          message: "Real-time batch updates are back.",
        },
        { stage: "watcher", code: "WATCHER_RECOVERED" },
      );
    }

    if (type === "new-batch") {
      let resolvedBatch = batch;
      if (batch.files?.some((f) => f.status === FILE_STATUS.ROLLED_BACK)) {
        try {
          const reasonsRes = await getRollbackReasonsByBatch(batch.path);
          resolvedBatch = { ...batch, rollbackReasons: reasonsRes?.data ?? [] };
        } catch (err) { console.error("[BatchHistory] getRollbackReasonsByBatch failed in new-batch:", err); }
      }
      pendingAnimationsRef.current.add(`batch:${resolvedBatch.path}`);
      setDayGroups((prev) => {
        const dayFolder = parseDayFromBatchPath(resolvedBatch.path);
        const existingDayIdx = prev.findIndex((d) => d.dayFolder === dayFolder);

        if (existingDayIdx >= 0) {
          const day = prev[existingDayIdx];
          // Skeleton (loaded:false) — don't graft a partial batch over its empty
          // array or recompute counts from it; enumeration metadata stays intact.
          // Full content arrives on expand via readPrintedDay.
          if (day.loaded !== true) return prev;

          const updated = [...prev];
          const existsBatch = day.batches.find((b) => b.path === resolvedBatch.path);
          const newBatches = existsBatch
            ? day.batches.map((b) => {
                if (b.path !== resolvedBatch.path) return b;
                return { ...resolvedBatch, rollbackReasons: resolvedBatch.rollbackReasons ?? b.rollbackReasons };
              })
            : [...day.batches, resolvedBatch];
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

        const newDay = { dayFolder, date: dayFolder, label, totalBatches: 1, totalFiles: resolvedBatch.fileCount, batches: [resolvedBatch], loaded: true };
        return [newDay, ...prev].sort((a, b) => {
          const [ad, am, ay] = a.date.split("-").map(Number);
          const [bd, bm, by] = b.date.split("-").map(Number);
          return new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad);
        });
      });
    } else if (type === "new-file") {
      pendingAnimationsRef.current.add(`file:${file.path}`);
      setDayGroups((prev) =>
        prev.map((day) => {
          if (day.loaded !== true) return day; // skeleton has no batches — leave counts intact
          return {
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
          };
        }),
      );
    } else if (type === "removed") {
      let rollbackReasons = [];
      try {
        const reasonsRes = await getRollbackReasonsByBatch(batchPath);
        rollbackReasons = reasonsRes?.data ?? [];
      } catch (err) { console.error("[BatchHistory] getRollbackReasonsByBatch failed:", err); }
      setDayGroups((prev) =>
        prev.map((day) => {
          if (day.loaded !== true) return day; // skeleton has no batches — leave counts intact
          return {
            ...day,
            batches: day.batches.map((b) =>
              b.path === batchPath
                // Keep files as ROLLED_BACK (not []) so live state matches readSingleBatch's
                // snapshot reconstruction — search by file.name keeps the batch visible.
                ? { ...b, status: BATCH_STATUS.ROLLED_BACK, fileCount: 0, files: b.files.map((f) => ({ ...f, status: FILE_STATUS.ROLLED_BACK })), rollbackReasons }
                : b,
            ),
            totalFiles: day.batches.reduce((s, b) => s + (b.path === batchPath ? 0 : b.fileCount), 0),
          };
        }),
      );
    }
  }, [reloadLoadedDays]);

  useEffect(() => {
    loadData();
    startBatchWatcher();
    const cleanup = onBatchUpdate(handleBatchUpdate);
    return () => {
      stopBatchWatcher();
      cleanup();
      if (pollFallbackRef.current) {
        clearInterval(pollFallbackRef.current);
        pollFallbackRef.current = null;
      }
    };
  }, [loadData, handleBatchUpdate]);

  useEffect(() => {
    dayGroupsRef.current = dayGroups;
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

  // Lazy-load one skeleton day's full content (+ reasons) on first expand.
  const loadDayContent = useCallback(async (dayFolder) => {
    setLoadingDays((prev) => new Set(prev).add(dayFolder));
    try {
      const dayRes = await readPrintedDay(dayFolder);
      if (dayRes.success && dayRes.data) {
        const withReasons = await attachReasonsToDay(dayRes.data);
        setDayGroups((prev) => prev.map((d) => (d.dayFolder === dayFolder ? withReasons : d)));
      } else {
        const err = dayRes.errors?.[0];
        notify(
          {
            type: err?.type || "Error",
            title: err?.title || "Failed to load day",
            message: err?.message || "Could not load this day's batches.",
          },
          { stage: "readFolders", code: "READ_BATCH_DAY_FAILED" },
        );
      }
    } catch (err) {
      notify(
        {
          type: "Error",
          title: "Failed to load day",
          message: err?.message || "An unexpected error occurred.",
        },
        { stage: "readFolders", code: "READ_BATCH_DAY_EXCEPTION" },
      );
    } finally {
      setLoadingDays((prev) => {
        const next = new Set(prev);
        next.delete(dayFolder);
        return next;
      });
    }
  }, []);

  // Load-all-on-search: while the operator is actively searching and there are still
  // unloaded skeleton days, load them sequentially + progressively so the search spans
  // the WHOLE history (e.g. an order number living in an old day's filename), not just
  // the eager-loaded head. Reuses loadDayContent — each merge flips loaded:false→true,
  // and filteredDayGroups recomputes after every merge, so matches surface as they load.
  useEffect(() => {
    if (searchQuery.trim() === "") return; // browsing — keep older days lazy
    let cancelled = false;

    const runLoadAll = async () => {
      // Known edge (accepted): if the query changes while a sweep is mid-await on a slow SMB,
      // the new trigger may hit running===true and skip — load-all won't finish for the new
      // query until the next query change. Rare (debounce collapses typing), non-blocking
      // (re-type resumes). Closing it cleanly needs reworking the cancelled/abort mechanism;
      // not worth the risk for this edge. Revisit only if operators actually hit it.
      if (loadAllRunningRef.current) return; // a previous run is still in flight
      if (dayGroupsRef.current.every((d) => d.loaded === true)) return; // nothing left to load (cache)
      loadAllRunningRef.current = true;
      try {
        // Snapshot the skeleton folders at start; loadDayContent flips each to loaded:true.
        const pending = dayGroupsRef.current.filter((d) => d.loaded === false).map((d) => d.dayFolder);
        for (const df of pending) {
          if (cancelled) return; // search changed/cleared — stop loading the rest
          await loadDayContent(df); // loadingDays guard inside avoids clashing with a manual expand
          if (cancelled) return;
        }
      } finally {
        loadAllRunningRef.current = false;
      }
    };

    // Debounce so "3" → "3p" → "3pa" doesn't fire three separate load-all sweeps.
    const timer = setTimeout(runLoadAll, 350);
    return () => {
      cancelled = true; // abort the in-flight sweep when the query changes/clears
      clearTimeout(timer);
    };
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- loadDayContent is stable; only searchQuery should retrigger (NOT dayGroups, else every merge re-fires)

  const toggleDay = (day) => {
    const { date, dayFolder } = day;
    const willExpand = !expandedDays.has(date);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    // First expand of an unloaded skeleton → fetch its content. Idempotent:
    // skip if already loaded or a fetch is already in flight for this day.
    if (willExpand && day.loaded === false && dayFolder && !loadingDays.has(dayFolder)) {
      loadDayContent(dayFolder);
    }
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
      // Keep unloaded skeleton days visible ONLY while browsing (no active search):
      // under an active query a skeleton's full totalBatches pill would masquerade as
      // a match, so skeletons are hidden and the global empty-state explains the scope.
      // A loaded day emptied by the search filter is dropped as before — UNLESS the
      // user explicitly expanded it (lazy-load flips loaded:false→true; without this an
      // expanded no-match day would vanish instead of showing "No matches in this day").
      .filter((day) => (day.loaded === false && !q) || day.batches.length > 0 || expandedDays.has(day.date));
  }, [dayGroups, searchQuery, activePrinters, expandedDays]);

  // True while a search is active AND the load-all sweep still has skeleton days to
  // load (or a day fetch is in flight). Drives the empty-state spinner + the progressive
  // footer, and lets the empty-state drop the scoped "in loaded days" wording.
  const isSearchLoadingMore =
    searchQuery.trim() !== "" && (dayGroups.some((d) => d.loaded !== true) || loadingDays.size > 0);

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
        const res = await runMutation(() => rollbackFileApi({ filePath, batchPath, reason }), {
          refresh: async () => { await refreshFiles(); loadData(); },
        });
        if (res?.timedOut) return;
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
          removeStageFromStore(fileId);
          refreshFiles();
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
    [refreshFiles, loadData, removeStageFromStore],
  );

  const handleConfirmRollbackBatch = useCallback(
    async (reason) => {
      if (!rollbackModal) return;
      const { batchPath } = rollbackModal;
      setRollbackModal(null);
      try {
        const res = await runMutation(() => rollbackBatchApi({ batchPath, reason }), {
          refresh: async () => { await refreshFiles(); loadData(); },
        });
        if (res?.timedOut) return;
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
                  // Keep the files (marked ROLLED_BACK) instead of clearing — mirrors
                  // readSingleBatch's snapshot reconstruction so search (file.name) still
                  // matches this batch and live state == reloaded state.
                  files: b.files.map((f) => ({ ...f, status: FILE_STATUS.ROLLED_BACK })),
                  rollbackReasons: [{ file_id: null, reason_code: reason.code, reason_label: reason.label }],
                };
              }),
              totalFiles: day.batches.reduce((s, b) => s + (b.path === batchPath ? 0 : b.fileCount), 0),
            })),
          );
          const allStages = useStore.getState().productionStages;
          Object.keys(allStages)
            .filter((id) => allStages[id].batch_path === batchPath)
            .forEach((id) => removeStageFromStore(id));
          refreshFiles();
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
    [rollbackModal, refreshFiles, loadData, removeStageFromStore],
  );

  const handleDeleteBatch = useCallback(async (batchPath) => {
    if (!(await showConfirm("Permanently delete this empty batch folder? This cannot be undone."))) return;
    try {
      const res = await runMutation(() => deleteBatchApi(batchPath), {
        refresh: async () => { loadData(); },
      });
      if (res?.timedOut) return;
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
  }, [loadData]);

  const handleRegenerateXml = useCallback(async (batchPath) => {
    try {
      const res = await runMutation(() => regenerateXmlApi(batchPath));
      if (res?.timedOut) return;
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
            {searchQuery.trim() && isSearchLoadingMore ? (
              <>
                <div className={style.loading_spinner} />
                <span className={style.empty_state_text}>Searching older days…</span>
              </>
            ) : (
              <span className={style.empty_state_text}>
                {searchQuery.trim() || activePrinters.size > 0 ? "No results found." : "No batches yet."}
              </span>
            )}
          </div>
        )}

        {filteredDayGroups.map((day) => {
          const isDayExpanded = expandedDays.has(day.date);
          const isSkeleton = day.loaded === false;
          const isDayLoading = loadingDays.has(day.dayFolder);

          return (
            <div key={day.date} className={style.day_group}>
              <button type="button" className={style.day_row} onClick={() => toggleDay(day)}>
                <span className={style.chevron}>
                  {isDayExpanded ? <LuChevronDown size={18} /> : <LuChevronRight size={18} />}
                </span>
                <span className={style.day_date}>{day.date}</span>
                {day.label && <span className={style.day_label}>{day.label}</span>}
                <span className={`${style.day_pill} ${isSkeleton ? style.day_pill_skeleton : ""}`}>
                  {day.totalBatches} {day.totalBatches === 1 ? "batch" : "batches"}
                  {!isSkeleton && day.totalFiles != null ? ` · ${day.totalFiles} files` : ""}
                </span>
                {isSkeleton && searchQuery.trim() !== "" && (
                  <span className={style.day_skeleton_hint}>expand to search</span>
                )}
              </button>

              {isDayExpanded && (
                <div className={style.day_batches}>
                  {isDayLoading && day.batches.length === 0 ? (
                    <div className={style.day_loading}>
                      <div className={style.loading_spinner} />
                    </div>
                  ) : day.loaded === true && day.batches.length === 0 && searchQuery.trim() !== "" ? (
                    <div className={style.day_no_matches}>No matches in this day</div>
                  ) : (
                    day.batches.map((batch) => (
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
                        canPrintLabel={canPrintLabel}
                        onPrintLabel={handlePrintLabel}
                        selectedFilePaths={selectedFiles}
                        onToggleFileSelect={toggleFileSelect}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Progressive footer: matches from loaded days are already visible above while
            the sweep keeps loading the remaining skeleton days. */}
        {isSearchLoadingMore && filteredDayGroups.length > 0 && (
          <div className={style.search_loading_more}>
            <div className={style.loading_spinner} />
            <span>Searching older days…</span>
          </div>
        )}
      </div>

      {contextMenu &&
        createPortal(
          (() => {
            const isBulkContext = selectedFiles.has(contextMenu.file.path) && selectedFiles.size > 1;
            return (
              <ContextMenu
                id="batch-history-context-menu"
                anchorX={contextMenu.x}
                anchorY={contextMenu.y}
                onClose={() => { setContextMenu(null); if (selectedFiles.size > 0) clearFileSelection(); }}
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
                    label: isBulkContext ? `Rollback ${selectedFiles.size} selected` : "Rollback this file",
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
                            // Snapshot now — ContextMenu calls onClose() (which clears
                            // selectedFiles) before this onClick runs its async work
                            const entries = isBulkContext ? [...selectedFiles.entries()] : null;
                            if (reason.code === "OTHER") {
                              setOtherReasonText("");
                              setOtherReasonTarget(
                                isBulkContext ? { action: "bulk-rollback", entries } : { file, batch },
                              );
                              return;
                            }
                            if (isBulkContext) {
                              await handleBulkRollback({ code: reason.code, label: reason.label }, entries);
                            } else {
                              await handleRollbackFile(file.path, batch.path, { code: reason.code, label: reason.label });
                            }
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
              />
            );
          })(),
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
                    const { file, batch, action, entries } = otherReasonTarget;
                    const reason = { code: "OTHER", label: otherReasonText.trim() };
                    setOtherReasonTarget(null);
                    if (action === "bulk-rollback") handleBulkRollback(reason, entries);
                    else handleRollbackFile(file.path, batch.path, reason);
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
                    const { file, batch, action, entries } = otherReasonTarget;
                    const reason = { code: "OTHER", label: otherReasonText.trim() };
                    setOtherReasonTarget(null);
                    if (action === "bulk-rollback") handleBulkRollback(reason, entries);
                    else handleRollbackFile(file.path, batch.path, reason);
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
