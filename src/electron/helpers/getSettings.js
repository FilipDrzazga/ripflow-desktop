import os from "node:os";
import Store from "electron-store";

const store = new Store({
  defaults: {
    storagePath: "O:\\SPPrintReadyArtwork",
    xmlPath: "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork",
    workstationName: os.hostname(),
  },
});

export const getSettings = () => ({
  storagePath: store.get("storagePath"),
  xmlPath: store.get("xmlPath"),
  workstationName: store.get("workstationName"),
});

export const setSettings = ({ storagePath, xmlPath, workstationName }) => {
  store.set("storagePath", storagePath);
  store.set("xmlPath", xmlPath);
  if (workstationName !== undefined) store.set("workstationName", workstationName);
};
