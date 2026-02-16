import { create } from "zustand";

export const useStore = create((set) => ({
  folders: null,
  setFolders: (folders) => set({ folders }),
}));
