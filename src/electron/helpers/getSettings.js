import os from "node:os";
import Store from "electron-store";

const store = new Store({
  defaults: {
    storagePath: "O:\\SPPrintReadyArtwork",
    xmlPath: "\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork",
    workstationName: os.hostname(),
    customOrderFolderPath: "",
    labelPrinterName: "",
    workstationRole: "",
    shippedRetentionDays: 30,
    labelPrintMode: "automatic",
    clientId: "all",
  },
});

export const getSettings = () => ({
  storagePath: store.get("storagePath"),
  xmlPath: store.get("xmlPath"),
  workstationName: store.get("workstationName"),
  customOrderFolderPath: store.get("customOrderFolderPath"),
  labelPrinterName: store.get("labelPrinterName"),
  workstationRole: store.get("workstationRole"),
  shippedRetentionDays: store.get("shippedRetentionDays"),
  labelPrintMode: store.get("labelPrintMode"),
  clientId: store.get("clientId"),
});

export const setSettings = ({ storagePath, xmlPath, workstationName, customOrderFolderPath, labelPrinterName, workstationRole, shippedRetentionDays, labelPrintMode, clientId }) => {
  if (storagePath !== undefined) store.set("storagePath", storagePath);
  if (xmlPath !== undefined) store.set("xmlPath", xmlPath);
  if (workstationName !== undefined) store.set("workstationName", workstationName);
  if (customOrderFolderPath !== undefined) store.set("customOrderFolderPath", customOrderFolderPath);
  if (labelPrinterName !== undefined) store.set("labelPrinterName", labelPrinterName);
  if (workstationRole !== undefined) store.set("workstationRole", workstationRole);
  if (shippedRetentionDays !== undefined) store.set("shippedRetentionDays", Math.max(1, Math.floor(Number(shippedRetentionDays) || 30)));
  if (labelPrintMode !== undefined) store.set("labelPrintMode", labelPrintMode === "manual" ? "manual" : "automatic");
  if (clientId !== undefined) store.set("clientId", clientId);
};

export const getRollbackDefinitions = () => store.get("reasonDefinitions", null);

export const setRollbackDefinitions = (definitions) => store.set("reasonDefinitions", definitions);

export const clearRollbackDefinitions = () => store.delete("reasonDefinitions");
