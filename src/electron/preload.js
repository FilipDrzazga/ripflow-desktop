const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readFolders: () => ipcRenderer.invoke("read-folders"),
  onReadFoldersProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("read-folders:progress", handler);

    return () => ipcRenderer.removeListener("read-folders:progress", handler);
  },
  createBatch: (payload) => ipcRenderer.invoke("batch-create", payload),
  sendBatchToProductize: (batchRoot) => ipcRenderer.invoke("batch-productize", batchRoot),
});
