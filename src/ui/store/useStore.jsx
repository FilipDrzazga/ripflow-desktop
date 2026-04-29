import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

const applyFilters = (files, activeTab, searchQuery) => {
  const query = searchQuery.trim().toLowerCase();

  return files
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (activeTab !== "All" && item.materialType !== activeTab) return false;
        if (query) {
          const matchesOrderId = item.orderId?.toLowerCase().includes(query);
          const matchesCustomer = item.customerName?.toLowerCase().includes(query);
          return matchesOrderId || matchesCustomer;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
};

export const useStore = create(
  subscribeWithSelector((set, get) => ({
    activeTab: "All",
    setActiveTab: (tab) =>
      set((state) => ({
        activeTab: tab,
        filteredFiles: applyFilters(state.files, tab, state.searchQuery),
      })),
    searchQuery: "",
    setSearchQuery: (query) =>
      set((state) => ({
        searchQuery: query,
        filteredFiles: applyFilters(state.files, state.activeTab, query),
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

    files: [],
    filteredFiles: [],
    isRefreshingFiles: false,
    lastFilesRefreshAt: null,
    setFiles: (files) =>
      set((state) => ({
        files,
        filteredFiles: applyFilters(files, state.activeTab, state.searchQuery),
      })),
    setFilteredFiles: (filteredFiles) => set({ filteredFiles }),
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

        const validItems = groupItems.filter((item) => item.status !== "INVALID");

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
            filteredFiles: applyFilters(res.data, state.activeTab, state.searchQuery),
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

          return res;
        }

        const firstError = res.errors?.[0];
        get().setAlert({
          id: crypto.randomUUID(),
          type: firstError?.type || "Error",
          title: firstError?.title || errorTitle,
          message: firstError?.message || errorMessage,
        });

        return res;
      } catch (err) {
        get().setAlert({
          id: crypto.randomUUID(),
          type: err?.type || "Error",
          title: err?.title || errorTitle,
          message: err?.message || errorMessage,
        });

        return { success: false, errors: [err] };
      } finally {
        set({ isRefreshingFiles: false });
      }
    },
  })),
);
