const { contextBridge, ipcRenderer } = require("electron");

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const isValidBatchItem = (item) => {
  return isPlainObject(item) && isPlainObject(item.file) && isNonEmptyString(item.file.fullPath);
};

const assertBatch = (batch) => {
  if (!Array.isArray(batch) || batch.length === 0 || !batch.every(isValidBatchItem)) {
    throw new TypeError("Batch must be a non-empty array of items with file.fullPath.");
  }
};

const assertPath = (filePath) => {
  if (!isNonEmptyString(filePath)) {
    throw new TypeError("File path must be a non-empty string.");
  }
};

const api = Object.freeze({
  readFolders: () => ipcRenderer.invoke("read-folders"),
  onReadFoldersProgress: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Progress callback must be a function.");
    }

    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("read-folders:progress", handler);

    return () => ipcRenderer.removeListener("read-folders:progress", handler);
  },
  submitBatch: (batch) => {
    assertBatch(batch);
    return ipcRenderer.invoke("submit-batch", batch);
  },
  openPreview: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("open-preview", filePath);
  },
  readFileBuffer: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("file:read-buffer", filePath);
  },
  openInFolder: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("open-in-folder", filePath);
  },
  readPrintedFolder: () => ipcRenderer.invoke("read-printed-folder"),
  regenerateXml: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("regenerate-xml", batchPath);
  },
  rollbackBatch: (payload) => {
    if (!isPlainObject(payload) || !isNonEmptyString(payload.batchPath)) {
      throw new TypeError("rollbackBatch requires { batchPath: string }");
    }
    return ipcRenderer.invoke("rollback-batch-history", payload);
  },
  rollbackFile: (payload) => {
    if (!isPlainObject(payload) || !isNonEmptyString(payload.filePath) || !isNonEmptyString(payload.batchPath)) {
      throw new TypeError("rollbackFile requires { filePath: string, batchPath: string }");
    }
    return ipcRenderer.invoke("rollback-file-history", payload);
  },
  deleteBatch: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("delete-batch", batchPath);
  },
  startBatchWatcher: () => ipcRenderer.invoke("start-batch-watcher"),
  stopBatchWatcher: () => ipcRenderer.invoke("stop-batch-watcher"),
  onBatchUpdate: (callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("Batch update callback must be a function.");
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("batch:update", handler);
    return () => ipcRenderer.removeListener("batch:update", handler);
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => {
    if (!isPlainObject(settings)) throw new TypeError("Settings must be a plain object.");
    return ipcRenderer.invoke("settings:set", settings);
  },
  showConfirm: (message) => {
    if (!isNonEmptyString(message)) throw new TypeError("Confirm message must be a non-empty string.");
    return ipcRenderer.invoke("dialog:confirm", message);
  },
  getLogs: () => ipcRenderer.invoke("logs:getAll"),
  clearLogs: () => ipcRenderer.invoke("logs:clear"),
  getHeldFiles: () => ipcRenderer.invoke("hold:get"),
  holdFile: (fileId) => {
    assertPath(fileId);
    return ipcRenderer.invoke("hold:set", fileId);
  },
  unholdFile: (fileId) => {
    assertPath(fileId);
    return ipcRenderer.invoke("hold:unset", fileId);
  },
  getRollbackReasonsByBatch: (batchPath) => {
    assertPath(batchPath);
    return ipcRenderer.invoke("get-rollback-reasons-batch", batchPath);
  },
  getRollbackReasonsByFile: (fileId) => {
    assertPath(fileId);
    return ipcRenderer.invoke("get-rollback-reasons-file", fileId);
  },
  selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),
});

contextBridge.exposeInMainWorld("api", api);
