import { ipcMain } from "electron";
import { readFolders } from "./readFolders.js";
import { createBatch } from "./createBatch.js";

export function registerIpcHandlers() {
  (ipcMain.handle("read-folders", async (event) => {
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
  }),
    ipcMain.handle("create-batch", async (_event, batch) => {
      try {
        return await createBatch(batch);
      } catch (err) {
        return err;
      }
    }));
}
