import { create } from "zustand";

export const useStore = create((set) => ({
  files: [],
  setFiles: (files) => set({ files }),
}));
