import { ipcMain } from "electron";
import { readFolders } from "./readFolders.js";

export function registerIpcHandlers() {
  ipcMain.handle("read-folders", async (event) => {
    try {
      return await readFolders({
        onProgress: (payload) => {
          // payload: { label, percent }
          event.sender.send("read-folders:progress", payload);
        },
      });
    } catch (err) {
      return err.message;
    }
  });
}
