import { ipcMain } from "electron";
import { readFolders } from "./readFolders.js";
import { createBatch } from "./createBatch.js";

export function registerIpcHandlers() {
  ipcMain.handle("read-folder", readFolders);

  ipcMain.handle("batch-create", async (_event, payload) => {
    try {
      return await createBatch(payload);
    } catch (err) {
      return {
        ok: false,
        code: "UNKNOWN",
        userMessage: "Unexpected application error.",
        details: { rawMessage: err?.message || String(err) },
      };
    }
  });
}
