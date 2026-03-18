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
  openInFolder: (filePath) => {
    assertPath(filePath);
    return ipcRenderer.invoke("open-in-folder", filePath);
  },
});

contextBridge.exposeInMainWorld("api", api);
