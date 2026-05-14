import Store from "electron-store";

const store = new Store({
  defaults: {
    storagePath: "O:\\SPPrintReadyArtwork",
    xmlPath: "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork",
  },
});

export const getSettings = () => ({
  storagePath: store.get("storagePath"),
  xmlPath: store.get("xmlPath"),
});

export const setSettings = ({ storagePath, xmlPath }) => {
  store.set("storagePath", storagePath);
  store.set("xmlPath", xmlPath);
};
