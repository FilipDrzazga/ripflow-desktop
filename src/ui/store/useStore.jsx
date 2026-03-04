import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export const useStore = create(subscribeWithSelector((set, get) => ({
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
  setFiles: (files) => set({ files }),
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
})));
