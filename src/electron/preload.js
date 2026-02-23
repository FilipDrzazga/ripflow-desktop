const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readFolders: () => ipcRenderer.invoke("read-folders"),
  createBatch: (payload) => ipcRenderer.invoke("batch-create", payload),
  sendBatchToProductize: (batchRoot) => ipcRenderer.invoke("batch-productize", batchRoot),
});
