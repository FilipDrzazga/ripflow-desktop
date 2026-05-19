import os from "node:os";
import Store from "electron-store";

const store = new Store({
  defaults: {
    storagePath: "O:\\SPPrintReadyArtwork",
    xmlPath: "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork",
    workstationName: os.hostname(),
    customOrderFolderPath: "",
  },
});

export const getSettings = () => ({
  storagePath: store.get("storagePath"),
  xmlPath: store.get("xmlPath"),
  workstationName: store.get("workstationName"),
  customOrderFolderPath: store.get("customOrderFolderPath"),
});

export const setSettings = ({ storagePath, xmlPath, workstationName, customOrderFolderPath }) => {
  if (storagePath !== undefined) store.set("storagePath", storagePath);
  if (xmlPath !== undefined) store.set("xmlPath", xmlPath);
  if (workstationName !== undefined) store.set("workstationName", workstationName);
  if (customOrderFolderPath !== undefined) store.set("customOrderFolderPath", customOrderFolderPath);
};
