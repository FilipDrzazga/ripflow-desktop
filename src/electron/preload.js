const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readFolders: () => ipcRenderer.invoke("read-folders"),
  onReadFoldersProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("read-folders:progress", handler);

    return () => ipcRenderer.removeListener("read-folders:progress", handler);
  },
  createBatch: (batch) => ipcRenderer.invoke("create-batch", batch),
});
