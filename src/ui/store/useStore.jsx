import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { estimatePrintLength } from "../../shared/estimatePrintLength";
import { BATCH_STATUS, FILE_STATUS } from "../../shared/constants";
import { ROLLBACK_REASONS } from "../constants/rollbackReasons";
import { readFolders } from "../services/fileService";
import { readPrintedDays, readPrintedDay } from "../services/batchService";
import { getLogs, clearLogs as clearLogsApi, getHeldFiles, holdFile as holdFileApi, unholdFile as unholdFileApi, pruneOrphanHolds, getDbDegraded } from "../services/systemService";
import { getRollbackReasonsForFiles as getRollbackReasonsForFilesApi } from "../services/analyticsService";
import { getRollbackDefinitions as getRollbackDefinitionsApi } from "../services/reasonDefsService";
import { getFabricGlobals as getFabricGlobalsApi, getFabrics as getFabricsApi } from "../services/fabricService";
import { getShopProfile as getShopProfileApi } from "../services/profileService";
import { PROFILE_STATUS, resolveProfileResult } from "../utils/profileStatus";
import { getStagesByBatch as getStagesByBatchApi, getAllStages as getAllStagesApi, getStagesAfter as getStagesAfterApi, getAllStageHistory as getAllStageHistoryApi, clearAllProductionStages as clearAllProductionStagesApi, getOpenReprints as getOpenReprintsApi } from "../services/productionService";
import { scanRipErrors as scanRipErrorsApi, resolveRipError as resolveRipErrorApi } from "../services/ripErrorService";

const applySort = (groups, sortOrder, config = null) => {
  if (!sortOrder) return groups;
  if (sortOrder === "meters_desc") {
    return [...groups]
      .map((g) => ({ g, _len: estimatePrintLength(g.items, config).fixedTotalLengthM }))
      .sort((a, b) => b._len - a._len)
      .map(({ g }) => g);
  }
  if (sortOrder === "date_asc") {
    return [...groups].sort((a, b) => {
      const aMin = Math.min(...a.items.map((i) => new Date(i.createdAt).getTime()));
      const bMin = Math.min(...b.items.map((i) => new Date(i.createdAt).getTime()));
      return aMin - bMin;
    });
  }
  return groups;
};

const applyFilters = (files, activeTab, searchQuery, sortOrder, printTypeFilter, config = null) => {
  const query = searchQuery.trim().toLowerCase();

  const filtered = files
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (activeTab !== "All" && item.materialType !== activeTab) return false;
        if (printTypeFilter.length > 0 && !printTypeFilter.includes(item.printTypeCode)) return false;
        if (query) {
          const matchesOrderId = item.orderId?.toLowerCase().includes(query);
          const matchesCustomer = item.customerName?.toLowerCase().includes(query);
          const matchesMaterial = item.material?.toLowerCase().includes(query);
          return matchesOrderId || matchesCustomer || matchesMaterial;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return applySort(filtered, sortOrder, config);
};

export const getLastBatch = (batchDays) => {
  if (!batchDays || batchDays.length === 0) return null;
  for (const day of batchDays) {
    if (!day.batches || day.batches.length === 0) continue;
    // readdir returns PRINTED_HHMMSS-... folders alphabetically → oldest-first,
    // so iterate in reverse to find the newest active batch
    for (let i = day.batches.length - 1; i >= 0; i--) {
      if (day.batches[i].status === BATCH_STATUS.ACTIVE) return { batch: day.batches[i], day };
    }
    // All rolled back — still show the newest one
    return { batch: day.batches[day.batches.length - 1], day };
  }
  return null;
};

export const useStore = create(
  subscribeWithSelector((set, get) => ({
    activeTab: "All",
    setActiveTab: (tab) =>
      set((state) => ({
        activeTab: tab,
        filteredFiles: applyFilters(state.files, tab, state.searchQuery, state.sortOrder, state.printTypeFilter, state.fabricConfig),
      })),
    searchQuery: "",
    setSearchQuery: (query) =>
      set((state) => ({
        searchQuery: query,
        filteredFiles: applyFilters(state.files, state.activeTab, query, state.sortOrder, state.printTypeFilter, state.fabricConfig),
      })),
    sortOrder: null,
    setSortOrder: (order) =>
      set((state) => ({
        sortOrder: order,
        filteredFiles: applyFilters(state.files, state.activeTab, state.searchQuery, order, state.printTypeFilter, state.fabricConfig),
      })),
    printTypeFilter: [],
    setPrintTypeFilter: (printType) =>
      set((state) => ({
        printTypeFilter: printType,
        filteredFiles: applyFilters(state.files, state.activeTab, state.searchQuery, state.sortOrder, printType, state.fabricConfig),
      })),
    alerts: [],
    setAlert: (alert) => {
      const isAlertExists = get().alerts.some((item) => item.id === alert.id);
      if (isAlertExists) {
        return;
      }
      set((state) => ({ alerts: [alert, ...state.alerts] }));
    },
    deleteAlert: (id) =>
      set((state) => ({
        alerts: state.alerts.filter((alert) => alert.id !== id),
      })),

    isBatchSubmitting: false,
    setIsBatchSubmitting: (val) => set({ isBatchSubmitting: val }),

    // Set by main-process db:error / db:recovered signals — drives the degraded banner
    dbDegraded: false,
    setDbDegraded: (val) => set({ dbDegraded: val }),
    // Initial snapshot pull on startup — only sets true; recovery comes via db:recovered
    checkDbDegraded: async () => {
      try {
        const res = await getDbDegraded();
        if (res?.degraded) set({ dbDegraded: true });
      } catch (err) { console.error("[store] checkDbDegraded failed:", err); }
    },

    batchDays: [],
    setBatchDays: (days) => set({ batchDays: days }),
    // Lazy: load ONLY the newest day's content (the sole consumer of batchDays
    // outside BatchHistory is OverviewPanel/getLastBatch, which reads only the
    // newest active batch). Avoids the full PRINTED scan at startup + after submit.
    refreshBatchDays: async () => {
      try {
        const daysRes = await readPrintedDays();
        if (!daysRes.success || daysRes.data.length === 0) {
          set({ batchDays: [] });
          return;
        }
        const dayRes = await readPrintedDay(daysRes.data[0].dayFolder);
        set({ batchDays: dayRes.success && dayRes.data ? [dayRes.data] : [] });
      } catch (err) { console.error("[store] refreshBatchDays failed:", err); }
    },

    logs: [],
    addLog: (log) => set((state) => ({ logs: [log, ...state.logs].slice(0, 500) })),
    clearLogs: async () => {
      set({ logs: [] });
      try {
        await clearLogsApi();
      } catch (err) { console.error("[store] clearLogs failed:", err); }
    },
    loadLogsFromDb: async () => {
      try {
        const res = await getLogs();
        if (res?.success && Array.isArray(res.data)) {
          set({ logs: res.data });
        }
      } catch (err) { console.error("[store] loadLogsFromDb failed:", err); }
    },

    files: [],
    filteredFiles: [],
    isRefreshingFiles: false,
    lastFilesRefreshAt: null,
    setFiles: (files) =>
      set((state) => ({
        files,
        filteredFiles: applyFilters(files, state.activeTab, state.searchQuery, state.sortOrder, state.printTypeFilter, state.fabricConfig),
      })),
    heldIds: new Set(),
    heldReasons: new Map(),
    rollbackReasons: new Map(),
    reasonDefinitions: ROLLBACK_REASONS.map((r) => ({ code: r.code, label: r.label, iconName: r.iconName })),
    loadReasonDefinitions: async () => {
      try {
        const res = await getRollbackDefinitionsApi();
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          set({ reasonDefinitions: res.data });
        }
      } catch (err) { console.error("[store] loadReasonDefinitions failed:", err); }
    },

    fabricConfig: null,
    loadFabricConfig: async () => {
      try {
        const [globalsRes, fabricsRes] = await Promise.all([getFabricGlobalsApi(), getFabricsApi()]);
        if (globalsRes?.success && fabricsRes?.success) {
          set({ fabricConfig: { globals: globalsRes.data, fabrics: fabricsRes.data } });
        }
      } catch (err) { console.error("[store] loadFabricConfig failed:", err); }
    },

    // Shop-wide profile (printers, hotfolders, features). The profile itself stays a
    // plain value-or-null, but the status is stored alongside it so consumers no longer
    // have to infer "still loading" from "null" — see utils/profileStatus.js.
    shopProfile: null,
    shopProfileStatus: PROFILE_STATUS.LOADING,
    loadShopProfile: async () => {
      try {
        const res = await getShopProfileApi();
        // One set() for both fields: a render that saw a loaded status next to a null
        // profile (or the reverse) would be reading a state that never really existed.
        const { status, profile } = resolveProfileResult(res);
        set({ shopProfile: profile, shopProfileStatus: status });
      } catch (err) {
        // withTimeout REJECTS on the 5s profile:get deadline, so a hung main process
        // arrives here rather than in resolveProfileResult. Same failed pair either way.
        console.error("[store] loadShopProfile failed:", err);
        set({ shopProfile: null, shopProfileStatus: PROFILE_STATUS.FAILED });
      }
    },
    productionStages: {},
    loadStagesForBatch: async (batchPath) => {
      try {
        const res = await getStagesByBatchApi(batchPath);
        if (res?.success) {
          set((state) => ({
            productionStages: {
              ...state.productionStages,
              ...Object.fromEntries(res.data.map((r) => [r.file_id, r])),
            },
          }));
        }
      } catch (err) { console.error("[store] loadStagesForBatch failed:", err); }
    },
    loadAllStages: async () => {
      try {
        const res = await getAllStagesApi();
        if (res?.success) {
          set({ productionStages: Object.fromEntries(res.data.map((r) => [r.file_id, r])) });
        }
      } catch (err) { console.error("[store] loadAllStages failed:", err); }
    },
    loadStagesAfter: async (since) => {
      try {
        const res = await getStagesAfterApi(since);
        if (res?.success) {
          if (res.data.length > 0) {
            set((state) => ({
              productionStages: {
                ...state.productionStages,
                ...Object.fromEntries(res.data.map((r) => [r.file_id, r])),
              },
            }));
          }
          return { success: true };
        }
        return { success: false };
      } catch (err) {
        console.error("[store] loadStagesAfter failed:", err);
        return { success: false };
      }
    },
    updateStageInStore: (fileId, stageRow) => {
      set((state) => ({
        productionStages: { ...state.productionStages, [fileId]: stageRow },
      }));
    },
    stageHistory: {},
    loadAllStageHistory: async () => {
      try {
        const res = await getAllStageHistoryApi();
        if (res?.success && Array.isArray(res.data)) {
          const grouped = {};
          for (const row of res.data) {
            if (!grouped[row.file_id]) grouped[row.file_id] = [];
            grouped[row.file_id].push({ stage: row.stage, entered_at: row.entered_at });
          }
          set({ stageHistory: grouped });
        }
      } catch (err) { console.error("[store] loadAllStageHistory failed:", err); }
    },
    clearAllStages: async () => {
      try {
        const res = await clearAllProductionStagesApi();
        if (res?.success) set({ productionStages: {}, stageHistory: {} });
      } catch (err) { console.error("[store] clearAllStages failed:", err); }
    },
    addStageHistoryEntry: (fileId, stage, enteredAt) => {
      set((state) => {
        const existing = state.stageHistory[fileId] ?? [];
        return { stageHistory: { ...state.stageHistory, [fileId]: [...existing, { stage, entered_at: enteredAt }] } };
      });
    },

    removeStageFromStore: (fileId) => {
      set((state) => {
        const next = { ...state.productionStages };
        delete next[fileId];
        const nextHistory = { ...state.stageHistory };
        delete nextHistory[fileId];
        return { productionStages: next, stageHistory: nextHistory };
      });
    },

    // Open reprint requests (fulfilled_at IS NULL AND superseded_at IS NULL) across all
    // files. Used by the print-view OverviewPanel for a global "Reprints" count
    // (count = openReprints.length). Loaded once at startup (App.jsx). This is the DB's
    // authoritative open set — NOT derivable from productionStages, since a reprint whose
    // file was rolled back to the inbox has no file_stages row.
    openReprints: [],
    loadOpenReprints: async () => {
      try {
        const res = await getOpenReprintsApi();
        if (res?.success && Array.isArray(res.data)) {
          set({ openReprints: res.data });
          return { success: true };
        }
        return { success: false };
      } catch (err) {
        console.error("[store] loadOpenReprints failed:", err);
        return { success: false };
      }
    },

    // RIP errors (open only), keyed file_id → error row. Populated by loadRipErrors, which
    // triggers a main-process scan of WORKFLOW_ERROR/. No UI/polling wired yet (Phase 2/3).
    ripErrors: {},
    loadRipErrors: async () => {
      try {
        const res = await scanRipErrorsApi();
        if (res?.success && Array.isArray(res.data)) {
          set({ ripErrors: Object.fromEntries(res.data.map((r) => [r.file_id, r])) });
          return { success: true };
        }
        return { success: false };
      } catch (err) {
        console.error("[store] loadRipErrors failed:", err);
        return { success: false };
      }
    },
    // Optimistic clear after a rollback resolves the file's errors (badge gone at once;
    // the next loadRipErrors poll confirms). Mirrors removeStageFromStore.
    removeRipError: (fileId) => {
      set((state) => {
        if (!(fileId in state.ripErrors)) return state;
        const next = { ...state.ripErrors };
        delete next[fileId];
        return { ripErrors: next };
      });
    },
    // Manual resolve (UI-driven, second path next to rollback). Writes to the DB first and
    // only drops the row from the store on success, so a failed write leaves the badge in
    // place. The UI reports the outcome — the store stays silent (no notify here).
    resolveRipError: async (fileId) => {
      try {
        const res = await resolveRipErrorApi(fileId);
        if (res?.success) {
          get().removeRipError(fileId);
          return { success: true };
        }
        return { success: false, error: res?.error };
      } catch (err) {
        console.error("[store] resolveRipError failed:", err);
        return { success: false, error: { message: err.message } };
      }
    },
    clearRipErrorsForFiles: (fileIds) => {
      set((state) => {
        const ids = new Set(fileIds);
        let changed = false;
        const next = {};
        for (const [key, value] of Object.entries(state.ripErrors)) {
          if (ids.has(key)) { changed = true; continue; }
          next[key] = value;
        }
        return changed ? { ripErrors: next } : state;
      });
    },

    loadRollbackReasonsForInbox: async (fileIds) => {
      if (!fileIds.length) { set({ rollbackReasons: new Map() }); return; }
      try {
        const res = await getRollbackReasonsForFilesApi(fileIds);
        if (res?.success && Array.isArray(res.data)) {
          const map = new Map();
          for (const row of res.data) map.set(row.file_id, { reasonCode: row.reason_code, reasonLabel: row.reason_label });
          set({ rollbackReasons: map });
        }
      } catch (err) { console.error("[store] loadRollbackReasonsForInbox failed:", err); }
    },
    loadHeldFiles: async () => {
      try {
        const res = await getHeldFiles();
        if (res?.success && Array.isArray(res.data)) {
          const heldIds = new Set();
          const heldReasons = new Map();
          for (const r of res.data) {
            heldIds.add(r.file_id);
            if (r.reason) heldReasons.set(r.file_id, r.reason);
          }
          set({ heldIds, heldReasons });
        }
      } catch (err) { console.error("[store] loadHeldFiles failed:", err); }
    },
    toggleHold: async (fileId, reason = "") => {
      const { heldIds, heldReasons } = get();
      const newHeldIds = new Set(heldIds);
      const newHeldReasons = new Map(heldReasons);
      if (heldIds.has(fileId)) {
        try {
          await unholdFileApi(fileId);
          newHeldIds.delete(fileId);
          newHeldReasons.delete(fileId);
          set({ heldIds: newHeldIds, heldReasons: newHeldReasons });
        } catch (err) { console.error("[store] unholdFile failed:", err); }
      } else {
        try {
          await holdFileApi(fileId, reason);
          newHeldIds.add(fileId);
          set({ heldIds: newHeldIds, heldReasons: newHeldReasons });
          await get().loadHeldFiles();
        } catch (err) { console.error("[store] holdFile failed:", err); }
      }
    },

    selectedIds: new Set(),
    selectedOverrides: new Map(),
    setOverride: (itemId, override) =>
      set((s) => {
        const next = new Map(s.selectedOverrides);
        next.set(itemId, override);
        return { selectedOverrides: next };
      }),
    setOverridesBulk: (entries) =>
      set((s) => {
        const next = new Map(s.selectedOverrides);
        entries.forEach(({ id, override }) => next.set(id, override));
        return { selectedOverrides: next };
      }),
    clearOverride: (itemId) =>
      set((s) => {
        const next = new Map(s.selectedOverrides);
        next.delete(itemId);
        return { selectedOverrides: next };
      }),
    clearAllOverrides: () => set({ selectedOverrides: new Map() }),
    toggleItemSelection: (id) =>
      set((state) => {
        const newSelectedIds = new Set(state.selectedIds);

        let clickedItem = null;
        state.filteredFiles.forEach((group) => {
          group.items.forEach((item) => {
            if (item.id === id) clickedItem = item;
          });
        });

        if (!clickedItem) return state;
        if (state.heldIds.has(id)) return state;

        if (newSelectedIds.has(id)) {
          newSelectedIds.delete(id);
          return { selectedIds: newSelectedIds };
        }

        const selectedMaterialTypes = new Set();
        state.filteredFiles.forEach((group) => {
          group.items.forEach((item) => {
            if (newSelectedIds.has(item.id)) {
              selectedMaterialTypes.add(item.materialType);
            }
          });
        });

        const lockMaterial = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

        if (lockMaterial && clickedItem.materialType !== lockMaterial) {
          return state; // brak zmiany
        }

        newSelectedIds.add(id);
        return { selectedIds: newSelectedIds };
      }),

    toggleGroupSelection: (groupItems) =>
      set((state) => {
        const newSelectedIds = new Set(state.selectedIds);

        const validItems = groupItems.filter((item) => item.status !== FILE_STATUS.INVALID && !state.heldIds.has(item.id));

        const selectedMaterialTypes = new Set();
        state.filteredFiles.forEach((group) => {
          group.items.forEach((item) => {
            if (newSelectedIds.has(item.id)) {
              selectedMaterialTypes.add(item.materialType);
            }
          });
        });

        const lockMaterial = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

        const allSelected = validItems.every((item) => newSelectedIds.has(item.id));

        if (allSelected) {
          validItems.forEach((item) => newSelectedIds.delete(item.id));
          return { selectedIds: newSelectedIds };
        }

        validItems.forEach((item) => {
          if (!lockMaterial || item.materialType === lockMaterial) {
            newSelectedIds.add(item.id);
          }
        });

        return { selectedIds: newSelectedIds };
      }),

    toggleClearSelection: () => set(() => ({ selectedIds: new Set(), selectedOverrides: new Map() })),

    holdSelectedFiles: async (reason = "") => {
      const { selectedIds, heldIds } = get();
      const toHold = [...selectedIds].filter((id) => !heldIds.has(id));
      if (toHold.length === 0) return;
      for (const fileId of toHold) {
        await get().toggleHold(fileId, reason);
      }
      set({ selectedIds: new Set() });
    },
    refreshFiles: async ({
      successTitle = "Folders reloaded",
      successMessage = "The folder data has been refreshed.",
      errorTitle = "Failed to load folders",
      errorMessage = "An unexpected error occurred while loading folders.",
      showSuccessAlert = true,
      clearSelection = false,
    } = {}) => {
      if (get().isRefreshingFiles) return { success: false, skipped: true };

      set({ isRefreshingFiles: true });

      try {
        const res = await readFolders();

        if (res.success) {
          // selectedOverrides holds ONLY manual operator overrides. Reprint
          // quantities are applied at submit time (see fileService.submitBatch)
          // and are no longer seeded into the override map here.
          set((state) => ({
            files: res.data,
            filteredFiles: applyFilters(res.data, state.activeTab, state.searchQuery, state.sortOrder, state.printTypeFilter, state.fabricConfig),
            selectedIds: clearSelection ? new Set() : state.selectedIds,
            lastFilesRefreshAt: new Date().toISOString(),
          }));

          // Prune orphaned holds (DB cleanup) off the FRESH res.data — never store.files,
          // which is left stale on a failed scan. Gate is absolute: we're already inside
          // res.success, and we additionally require ZERO scan warnings. A single warning
          // means the defensive scan skipped a file/folder => res.data may be missing a live
          // file => we must NOT prune (an inflated Hold count is acceptable; deleting a live
          // hold is not). id === `${folder}_${filename}` — same key as readFolders + held_files.
          //
          // Orphan = held file_id ∉ current inbox ids (simple diff, per product decision):
          // holds whose material-folder has vanished from the inbox ARE pruned. Consciously
          // accepted residual risks, left in place:
          //   1. If SMB ever returns a silently-partial ROOT listing (readdir resolves, no
          //      throw, no warning, so the gate still passes), holds for the omitted folder
          //      get deleted despite their files existing. Rare — a root readdir normally
          //      returns the full listing or throws (→ res.success:false → no prune). This is
          //      the "folder vanished from root without a warning" case: it IS pruned, and
          //      that is the accepted trade for actually fixing the inflated count.
          //   2. A present-but-unparseable file is absent from res.data and would be pruned.
          // The liveIds.length > 0 guard (also enforced in the DB fn) stops a spurious
          // "empty but clean" mount from wiping every hold at once.
          if ((res.warnings?.length ?? 0) === 0) {
            const liveIds = res.data.flatMap((g) => g.items.map((i) => i.id));
            if (liveIds.length > 0) {
              try {
                const pruneRes = await pruneOrphanHolds(liveIds);
                if (pruneRes?.success && pruneRes.removed > 0) {
                  await get().loadHeldFiles(); // re-read heldIds from the pruned DB state
                }
              } catch (err) {
                console.error("[store] prune orphan holds failed:", err);
              }
            }
          }

          if (showSuccessAlert) {
            get().setAlert({
              id: crypto.randomUUID(),
              type: "Success",
              title: successTitle,
              message: successMessage,
            });
          }

          get().addLog({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: "success",
            stage: "readFolders",
            code: "FOLDERS_LOADED",
            message: `${successTitle}: ${successMessage}`,
            detail: null,
          });

          const allFileIds = res.data.flatMap((g) => g.items.map((i) => i.file.name.replace(/\.[^.]+$/, "")));
          await get().loadRollbackReasonsForInbox(allFileIds);

          const invalidItems = res.data.flatMap((g) => g.items.filter((i) => i.status === FILE_STATUS.INVALID));
          invalidItems.forEach((item) => {
            get().addLog({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: "warning",
              stage: "readFolders",
              code: "FILE_INVALID",
              message: `Invalid file: ${item.file.name}`,
              detail: item.errors?.length || item.warnings?.length
                ? { errors: item.errors, warnings: item.warnings }
                : null,
            });
          });

          // Files/folders skipped by the defensive scan — the operator must know the
          // inbox is partial. One summary alert + a log entry per skipped entry.
          if (Array.isArray(res.warnings) && res.warnings.length > 0) {
            get().setAlert({
              id: crypto.randomUUID(),
              type: "Warning",
              title: "Some items skipped during scan",
              message: `${res.warnings.length} file(s)/folder(s) could not be read and were skipped.`,
            });
            res.warnings.forEach((w) => {
              get().addLog({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                type: "warning",
                stage: "readFolders",
                code: "SCAN_SKIPPED",
                message: w,
                detail: null,
              });
            });
          }

          return res;
        }

        const firstError = res.errors?.[0];
        get().setAlert({
          id: crypto.randomUUID(),
          type: firstError?.type || "Error",
          title: firstError?.title || errorTitle,
          message: firstError?.message || errorMessage,
        });
        get().addLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: "error",
          stage: "readFolders",
          code: firstError?.code || "FOLDERS_LOAD_FAILED",
          message: `${firstError?.title || errorTitle}: ${firstError?.message || errorMessage}`,
          detail: res.errors ? { errors: res.errors } : null,
        });

        return res;
      } catch (err) {
        get().setAlert({
          id: crypto.randomUUID(),
          type: err?.type || "Error",
          title: err?.title || errorTitle,
          message: err?.message || errorMessage,
        });
        get().addLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: "error",
          stage: "readFolders",
          code: "FOLDERS_LOAD_EXCEPTION",
          message: `${err?.title || errorTitle}: ${err?.message || errorMessage}`,
          detail: err?.message ? { message: err.message } : null,
        });

        return { success: false, errors: [err] };
      } finally {
        set({ isRefreshingFiles: false });
      }
    },
  })),
);
