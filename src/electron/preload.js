const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readFolder: () => ipcRenderer.invoke("read-folder"),
  createBatch: (payload) => ipcRenderer.invoke("batch-create", payload),
  sendBatchToProductize: (batchRoot) => ipcRenderer.invoke("batch-productize", batchRoot),
});
