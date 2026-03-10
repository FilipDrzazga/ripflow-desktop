import { ipcMain } from "electron";
import { readFolders } from "./readFolders.js";
import { createBatch } from "./createBatch.js";
import { submitBatchToPrintFactory } from "./createXML.js";

export function registerIpcHandlers() {
  ipcMain.handle("read-folders", async (event) => {
    try {
      return await readFolders({
        onProgress: (payload) => {
          event.sender.send("read-folders:progress", payload);
        },
      });
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  });

  ipcMain.handle("create-batch", async (_event, batch) => {
    return createBatch(batch);
  });

  ipcMain.handle("create-xml", async (_event, batch, createdBatchId) => {
    return submitBatchToPrintFactory(batch, createdBatchId);
  });
}
