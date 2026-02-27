import { create } from "zustand";

export const useStore = create((set) => ({
  files: [],
  filteredFiles: [],
  setFiles: (files) => set({ files }),
  setFilteredFiles: (filteredFiles) => set({ filteredFiles }),
}));
