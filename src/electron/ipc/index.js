import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { readFolders } from "./readFolders.js";
import { submitBatch } from "./submitBatch.js";
import { openPreview } from "./openPreview.js";
import { openInFolder } from "./openInFolder.js";
import { openInShopify } from "./openInShopify.js";
import { readPrintedFolder, readSingleBatch, parseBatchFolderName } from "./readPrintedFolder.js";
import { rollbackBatchFromHistory, rollbackFileFromHistory, regenerateXmlForBatch, deleteBatchFolder } from "./batchHistoryHandlers.js";
import { registerCustomOrderHandlers } from "./customOrderHandlers.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { assertStorageFilePath } from "../helpers/validateStoragePath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";
import { getSettings, setSettings } from "../helpers/getSettings.js";
import { initDb, insertLog, getAllLogs, clearAllLogs, holdFile, unholdFile, getHeldFiles, getRollbackReasonsByBatch, getRollbackReasonsByFile, getRollbackStats, getRollbackDetails, clearAllRollbackReasons, getLatestRollbackReasonsForFileIds } from "../helpers/db.js";

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{4}$/;

let batchWatcher = null;
let watcherSender = null;
const debounceMap = new Map();

const getPrintedRootPath = () => path.join(getStorageRootPath(), "PRINTED");

const processWatchEvent = async (relativePath) => {
  if (!watcherSender || watcherSender.isDestroyed()) return;

  const normalized = relativePath.replace(/\//g, path.sep);
  const parts = normalized.split(path.sep).filter(Boolean);

  if (parts.length < 2) return;

  const [dayFolder, batchFolder, ...rest] = parts;

  if (!DAY_FOLDER_RE.test(dayFolder)) return;

  const meta = parseBatchFolderName(batchFolder);
  if (!meta) return;

  const printedRoot = getPrintedRootPath();
  const batchPath = path.join(printedRoot, dayFolder, batchFolder);

  try {
    await fs.promises.access(batchPath);
  } catch {
    watcherSender.send("batch:update", { type: "removed", batchPath });
    return;
  }

  if (rest.length === 0) {
    try {
      const batchData = await readSingleBatch(batchPath, meta);
      watcherSender.send("batch:update", { type: "new-batch", batch: batchData });
    } catch (err) {
      if (err.code === "ENOENT") {
        watcherSender.send("batch:update", { type: "removed", batchPath });
      } else {
        console.error("[watcher] readSingleBatch failed:", err);
      }
    }
    return;
  }

  const fileName = rest[0];
  if (!fileName.toLowerCase().endsWith(".pdf")) return;

  const filePath = path.join(batchPath, fileName);

  try {
    await fs.promises.access(filePath);
    const parsed = parsePrintFileName(fileName, { fullPath: filePath, dir: batchPath });
    watcherSender.send("batch:update", {
      type: "new-file",
      batchPath,
      file: { name: fileName, path: filePath, type: parsed?.printTypeCode || "UNKNOWN" },
    });
  } catch {
    try {
      const entries = await fs.promises.readdir(batchPath, { withFileTypes: true });
      const hasPdfs = entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"));
      if (!hasPdfs) {
        watcherSender.send("batch:update", { type: "removed", batchPath });
      }
    } catch {
      watcherSender.send("batch:update", { type: "removed", batchPath });
    }
  }
};

export function registerIpcHandlers() {
  initDb();
  registerCustomOrderHandlers();

  ipcMain.handle("logs:getAll", () => {
    return { success: true, data: getAllLogs() };
  });

  ipcMain.handle("logs:clear", () => {
    clearAllLogs(getSettings().workstationName ?? "");
    return { success: true };
  });

  ipcMain.handle("hold:get", () => {
    return { success: true, data: getHeldFiles() };
  });

  ipcMain.handle("hold:set", (_event, fileId, reason) => {
    holdFile(fileId, getSettings().workstationName ?? "", reason ?? "");
    return { success: true };
  });

  ipcMain.handle("hold:unset", (_event, fileId) => {
    unholdFile(fileId);
    return { success: true };
  });

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
    const result = await submitBatch(batch);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "submitBatch",
        code: result.success ? "BATCH_SUBMITTED" : (result.errors?.[0]?.code || "BATCH_FAILED"),
        message: result.success
          ? `Batch submitted: ${result.batchId}`
          : (result.errors?.[0]?.message || "Batch submission failed"),
        detail: result.success ? { batchId: result.batchId } : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (submit-batch):", err); }
    return result;
  });

  ipcMain.handle("open-preview", async (_event, filePath) => {
    return openPreview(filePath);
  });

  ipcMain.handle("file:read-buffer", async (_event, filePath) => {
    try {
      const validatedPath = await assertStorageFilePath(filePath, { stage: "file:read-buffer", title: "Invalid file path" });
      const buffer = await fs.promises.readFile(validatedPath);
      return { success: true, data: buffer.toString("base64") };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-in-folder", async (_event, filePath) => {
    return openInFolder(filePath);
  });

  ipcMain.handle("open-in-shopify", async (_event, orderName) => {
    return openInShopify(orderName);
  });

  ipcMain.handle("read-printed-folder", async () => {
    return readPrintedFolder();
  });

  ipcMain.handle("regenerate-xml", async (_event, batchPath) => {
    const result = await regenerateXmlForBatch(batchPath);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "regenerateXml",
        code: result.success ? "XML_REGENERATED" : (result.errors?.[0]?.code || "XML_REGEN_FAILED"),
        message: result.success
          ? "XML regenerated successfully"
          : (result.errors?.[0]?.message || "XML regeneration failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (regenerate-xml):", err); }
    return result;
  });

  ipcMain.handle("rollback-batch-history", async (_event, payload) => {
    const result = await rollbackBatchFromHistory(payload);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "rollbackBatch",
        code: result.success ? "BATCH_ROLLED_BACK" : (result.errors?.[0]?.code || "ROLLBACK_FAILED"),
        message: result.success
          ? `Batch rolled back: ${result.restoredFiles?.length || 0} files restored`
          : (result.errors?.[0]?.message || "Rollback failed"),
        detail: result.success ? { restoredFiles: result.restoredFiles } : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (rollback-batch):", err); }
    return result;
  });

  ipcMain.handle("rollback-file-history", async (_event, payload) => {
    const result = await rollbackFileFromHistory(payload);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "rollbackFile",
        code: result.success ? "FILE_ROLLED_BACK" : (result.errors?.[0]?.code || "FILE_ROLLBACK_FAILED"),
        message: result.success
          ? "File rolled back successfully"
          : (result.errors?.[0]?.message || "File rollback failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (rollback-file):", err); }
    return result;
  });

  ipcMain.handle("get-rollback-stats", (_event, since) => {
    return { success: true, data: getRollbackStats(since ?? null) };
  });

  ipcMain.handle("get-rollback-details", (_event, since) => {
    return { success: true, data: getRollbackDetails(since ?? null) };
  });

  ipcMain.handle("rollback-reasons:clear", () => {
    clearAllRollbackReasons();
    return { success: true };
  });

  ipcMain.handle("get-rollback-reasons-batch", (_event, batchPath) => {
    return { success: true, data: getRollbackReasonsByBatch(batchPath) };
  });

  ipcMain.handle("get-rollback-reasons-file", (_event, fileId) => {
    return { success: true, data: getRollbackReasonsByFile(fileId) };
  });

  ipcMain.handle("get-rollback-reasons-files", (_event, fileIds) => {
    if (!Array.isArray(fileIds)) return { success: true, data: [] };
    return { success: true, data: getLatestRollbackReasonsForFileIds(fileIds) };
  });

  ipcMain.handle("delete-batch", async (_event, batchPath) => {
    const result = await deleteBatchFolder(batchPath);
    try {
      insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: result.success ? "success" : "error",
        stage: "deleteBatch",
        code: result.success ? "BATCH_DELETED" : (result.errors?.[0]?.code || "DELETE_FAILED"),
        message: result.success
          ? "Batch deleted"
          : (result.errors?.[0]?.message || "Delete batch failed"),
        detail: result.success ? null : { errors: result.errors },
        workstation: getSettings().workstationName,
      });
    } catch (err) { console.error("[ipc] insertLog failed (delete-batch):", err); }
    return result;
  });

  ipcMain.handle("start-batch-watcher", (event) => {
    watcherSender = event.sender;

    if (batchWatcher) return { success: true };

    try {
      const printedRoot = getPrintedRootPath();
      fs.mkdirSync(printedRoot, { recursive: true });

      batchWatcher = fs.watch(printedRoot, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        clearTimeout(debounceMap.get(filename));
        debounceMap.set(
          filename,
          setTimeout(() => {
            debounceMap.delete(filename);
            processWatchEvent(filename).catch(() => {});
          }, 200),
        );
      });

      batchWatcher.on("error", () => {
        if (batchWatcher) {
          batchWatcher.close();
          batchWatcher = null;
        }
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stop-batch-watcher", () => {
    if (batchWatcher) {
      batchWatcher.close();
      batchWatcher = null;
    }
    watcherSender = null;
    return { success: true };
  });

  ipcMain.handle("settings:get", () => {
    return { success: true, settings: getSettings() };
  });

  ipcMain.handle("settings:set", async (_event, settings) => {
    const { storagePath, xmlPath, workstationName, customOrderFolderPath } = settings ?? {};
    if (!storagePath || !xmlPath) {
      return { success: false, error: "Both paths are required." };
    }
    try {
      await fs.promises.access(storagePath);
    } catch {
      return { success: false, error: `Storage path does not exist: ${storagePath}` };
    }
    try {
      await fs.promises.access(xmlPath);
    } catch {
      return { success: false, error: `XML path does not exist: ${xmlPath}` };
    }
    if (customOrderFolderPath) {
      try {
        await fs.promises.access(customOrderFolderPath);
      } catch {
        return { success: false, error: `Custom Order folder path does not exist: ${customOrderFolderPath}` };
      }
    }
    setSettings({ storagePath, xmlPath, workstationName, customOrderFolderPath });
    return { success: true };
  });

  ipcMain.handle("dialog:select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true, path: null };
    }
    return { success: true, canceled: false, path: result.filePaths[0] };
  });
}
