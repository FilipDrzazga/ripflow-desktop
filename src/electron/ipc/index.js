import { ipcMain } from "electron";
import { readFolders } from "./readFolders.js";
import { submitBatch } from "./submitBatch.js";
import { openPreview } from "./openPreview.js";
import { openInFolder } from "./openInFolder.js";

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
        errors: [
          {
            code: err.code || "UNKNOWN_ERROR",
            message: err.message || "An unknown error occurred.",
            stage: err.stage || "read-folders",
            type: err.type || "Error",
            title: err.title || "Read folders failed",
          },
        ],
      };
    }
  });

  ipcMain.handle("submit-batch", async (_event, batch) => {
    return submitBatch(batch);
  });

  ipcMain.handle("open-preview", async (_event, filePath) => {
    return openPreview(filePath);
  });

  ipcMain.handle("open-in-folder", async (_event, filePath) => {
    return openInFolder(filePath);
  });
}
