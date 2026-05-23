import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { estimatePrintLength } from "../../shared/estimatePrintLength";

const applySort = (groups, sortOrder) => {
  if (!sortOrder) return groups;
  if (sortOrder === "meters_desc") {
    return [...groups]
      .map((g) => ({ g, _len: estimatePrintLength(g.items).fixedTotalLengthM }))
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

const applyFilters = (files, activeTab, searchQuery, sortOrder, printTypeFilter) => {
  const query = searchQuery.trim().toLowerCase();

  const filtered = files
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (activeTab !== "All" && item.materialType !== activeTab) return false;
        if (printTypeFilter && item.printTypeCode !== printTypeFilter) return false;
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

  return applySort(filtered, sortOrder);
};

export const getLastBatch = (batchDays) => {
  if (!batchDays || batchDays.length === 0) return null;
  for (const day of batchDays) {
    if (!day.batches || day.batches.length === 0) continue;
    // readdir returns PRINTED_HHMMSS-... folders alphabetically → oldest-first,
    // so iterate in reverse to find the newest active batch
    for (let i = day.batches.length - 1; i >= 0; i--) {
      if (day.batches[i].status === "active") return { batch: day.batches[i], day };
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
        filteredFiles: applyFilters(state.files, tab, state.searchQuery, state.sortOrder, state.printTypeFilter),
      })),
    searchQuery: "",
    setSearchQuery: (query) =>
      set((state) => ({
        searchQuery: query,
        filteredFiles: applyFilters(state.files, state.activeTab, query, state.sortOrder, state.printTypeFilter),
      })),
    sortOrder: null,
    setSortOrder: (order) =>
      set((state) => ({
        sortOrder: order,
        filteredFiles: applyFilters(state.files, state.activeTab, state.searchQuery, order, state.printTypeFilter),
      })),
    printTypeFilter: null,
    setPrintTypeFilter: (printType) =>
      set((state) => ({
        printTypeFilter: printType,
        filteredFiles: applyFilters(state.files, state.activeTab, state.searchQuery, state.sortOrder, printType),
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

    batchDays: [],
    setBatchDays: (days) => set({ batchDays: days }),
    refreshBatchDays: async () => {
      try {
        const res = await window.api.readPrintedFolder();
        if (res.success) set({ batchDays: res.data });
      } catch (e) {
        void e;
      }
    },

    logs: [],
    addLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
    clearLogs: async () => {
      set({ logs: [] });
      try {
        await window.api.clearLogs();
      } catch {}
    },
    loadLogsFromDb: async () => {
      try {
        const res = await window.api.getLogs();
        if (res?.success && Array.isArray(res.data)) {
          set({ logs: res.data });
        }
      } catch {}
    },

    files: [],
    filteredFiles: [],
    isRefreshingFiles: false,
    lastFilesRefreshAt: null,
    setFiles: (files) =>
      set((state) => ({
        files,
        filteredFiles: applyFilters(files, state.activeTab, state.searchQuery, state.sortOrder, state.printTypeFilter),
      })),
    heldIds: new Set(),
    loadHeldFiles: async () => {
      try {
        const res = await window.api.getHeldFiles();
        if (res?.success && Array.isArray(res.data)) {
          set({ heldIds: new Set(res.data) });
        }
      } catch {}
    },
    toggleHold: async (fileId) => {
      const { heldIds } = get();
      const newHeldIds = new Set(heldIds);
      if (heldIds.has(fileId)) {
        try {
          await window.api.unholdFile(fileId);
          newHeldIds.delete(fileId);
          set({ heldIds: newHeldIds });
        } catch {}
      } else {
        try {
          await window.api.holdFile(fileId);
          newHeldIds.add(fileId);
          set({ heldIds: newHeldIds });
        } catch {}
      }
    },

    selectedIds: new Set(),
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

        const validItems = groupItems.filter((item) => item.status !== "INVALID" && !state.heldIds.has(item.id));

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

    toggleClearSelection: () => set(() => ({ selectedIds: new Set() })),

    holdSelectedFiles: async () => {
      const { selectedIds, heldIds } = get();
      const toHold = [...selectedIds].filter((id) => !heldIds.has(id));
      if (toHold.length === 0) return;
      for (const fileId of toHold) {
        await get().toggleHold(fileId);
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
        const res = await window.api.readFolders();

        if (res.success) {
          set((state) => ({
            files: res.data,
            filteredFiles: applyFilters(res.data, state.activeTab, state.searchQuery, state.sortOrder, state.printTypeFilter),
            selectedIds: clearSelection ? new Set() : state.selectedIds,
            lastFilesRefreshAt: new Date().toISOString(),
          }));

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

          const invalidItems = res.data.flatMap((g) => g.items.filter((i) => i.status === "INVALID"));
          invalidItems.forEach((item) => {
            get().addLog({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: "warning",
              stage: "readFolders",
              code: "FILE_INVALID",
              message: `Invalid file: ${item.name}`,
              detail: item.errors?.length || item.warnings?.length
                ? { errors: item.errors, warnings: item.warnings }
                : null,
            });
          });

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
