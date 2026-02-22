import { create } from "zustand";

export const useStore = create((set, get) => ({
  files: [],

  setFiles: (files) => set({ files }),

  removeFilesByIds: (ids) =>
    set((state) => ({
      files: state.files.filter((f) => !ids.includes(f.id)),
    })),
}));
