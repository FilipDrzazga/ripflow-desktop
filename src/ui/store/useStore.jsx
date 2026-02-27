import { create } from "zustand";

export const useStore = create((set) => ({
  files: [],
  filteredFiles: [],
  setFiles: (files) => set({ files }),
  setFilteredFiles: (filteredFiles) => set({ filteredFiles }),
  selectedIds: new Set(),
  toggleItemSelection: (id) =>
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return { selectedIds: newSelectedIds };
    }),
  toggleGroupSelection: (groupItems) =>
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      const allSelected = groupItems.every((item) => newSelectedIds.has(item.id));
      if (allSelected) {
        groupItems.forEach((item) => newSelectedIds.delete(item.id));
      } else {
        groupItems.forEach((item) => newSelectedIds.add(item.id));
      }
      return { selectedIds: newSelectedIds };
    }),
  toggleClearSelection: () => set(() => ({ selectedIds: new Set() })),
}));
