const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  readFolder: () => ipcRenderer.invoke("read-folder"),
});
