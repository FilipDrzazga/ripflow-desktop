import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { readFolders } from "./readFolders.js";
import { submitBatch } from "./submitBatch.js";
import { openPreview } from "./openPreview.js";
import { openInFolder } from "./openInFolder.js";
import { readPrintedFolder, readSingleBatch, parseBatchFolderName } from "./readPrintedFolder.js";
import { rollbackBatchFromHistory, rollbackFileFromHistory, regenerateXmlForBatch, deleteBatchFolder } from "./batchHistoryHandlers.js";
import { getStorageRootPath } from "../helpers/getRootPath.js";
import { parsePrintFileName } from "../helpers/parseFileName.js";

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
    const batchData = await readSingleBatch(batchPath, meta);
    watcherSender.send("batch:update", { type: "new-batch", batch: batchData });
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

  ipcMain.handle("read-printed-folder", async () => {
    return readPrintedFolder();
  });

  ipcMain.handle("regenerate-xml", async (_event, batchPath) => {
    return regenerateXmlForBatch(batchPath);
  });

  ipcMain.handle("rollback-batch-history", async (_event, batchPath) => {
    return rollbackBatchFromHistory(batchPath);
  });

  ipcMain.handle("rollback-file-history", async (_event, filePath, batchPath) => {
    return rollbackFileFromHistory(filePath, batchPath);
  });

  ipcMain.handle("delete-batch", async (_event, batchPath) => {
    return deleteBatchFolder(batchPath);
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
}
