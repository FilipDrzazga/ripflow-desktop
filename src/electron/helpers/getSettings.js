import os from "node:os";
import Store from "electron-store";

const store = new Store({
  defaults: {
    // Blank on purpose (ETAP 2h-3): no shop's network paths in the code. A blank path is
    // refused by getRootPath.js and reported at startup - see src/shared/requiredPaths.js.
    storagePath: "",
    xmlPath: "",
    workstationName: os.hostname(),
    customOrderFolderPath: "",
    // Etsy import (E3b-2): this PC imports Etsy orders only when it is switched on here (identity of the
    // machine, rule 25) AND the shop profile has features.etsy; the library is the folder of Etsy patterns.
    etsyImportEnabled: false,
    etsyLibraryPath: "",
    labelPrinterName: "",
    workstationRole: "",
    shippedRetentionDays: 30,
    batchHistoryEagerDays: 7,
    labelPrintMode: "automatic",
    clientId: "all",
  },
});

export const getSettings = () => ({
  storagePath: store.get("storagePath"),
  xmlPath: store.get("xmlPath"),
  workstationName: store.get("workstationName"),
  customOrderFolderPath: store.get("customOrderFolderPath"),
  etsyImportEnabled: store.get("etsyImportEnabled") === true,
  etsyLibraryPath: store.get("etsyLibraryPath"),
  labelPrinterName: store.get("labelPrinterName"),
  workstationRole: store.get("workstationRole"),
  shippedRetentionDays: store.get("shippedRetentionDays"),
  batchHistoryEagerDays: store.get("batchHistoryEagerDays"),
  labelPrintMode: store.get("labelPrintMode"),
  clientId: store.get("clientId"),
});

export const setSettings = ({ storagePath, xmlPath, workstationName, customOrderFolderPath, etsyImportEnabled, etsyLibraryPath, labelPrinterName, workstationRole, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId }) => {
  if (storagePath !== undefined) store.set("storagePath", storagePath);
  if (xmlPath !== undefined) store.set("xmlPath", xmlPath);
  if (workstationName !== undefined) store.set("workstationName", workstationName);
  if (customOrderFolderPath !== undefined) store.set("customOrderFolderPath", customOrderFolderPath);
  if (etsyLibraryPath !== undefined) store.set("etsyLibraryPath", String(etsyLibraryPath ?? "").trim());
  if (etsyImportEnabled !== undefined) {
    const on = etsyImportEnabled === true;
    // The import starts from the moment it is switched on - orders from before are not a backlog to dump
    // into the inbox. Switching it off forgets the moment, so the next switch-on starts afresh.
    if (on && store.get("etsyImportEnabled") !== true) store.set("etsyImportSince", Math.floor(Date.now() / 1000));
    if (!on) store.delete("etsyImportSince");
    store.set("etsyImportEnabled", on);
  }
  if (labelPrinterName !== undefined) store.set("labelPrinterName", labelPrinterName);
  if (workstationRole !== undefined) store.set("workstationRole", workstationRole);
  if (shippedRetentionDays !== undefined) store.set("shippedRetentionDays", Math.max(1, Math.floor(Number(shippedRetentionDays) || 30)));
  if (batchHistoryEagerDays !== undefined) store.set("batchHistoryEagerDays", Math.max(1, Math.floor(Number(batchHistoryEagerDays) || 7)));
  if (labelPrintMode !== undefined) store.set("labelPrintMode", labelPrintMode === "manual" ? "manual" : "automatic");
  if (clientId !== undefined) store.set("clientId", clientId);
};

// Epoch seconds the Etsy import was switched on (min_created of the order query), or null.
export const getEtsyImportSince = () => {
  const since = store.get("etsyImportSince");
  return Number.isInteger(since) && since > 0 ? since : null;
};

export const getRollbackDefinitions = () => store.get("reasonDefinitions", null);

export const clearRollbackDefinitions = () => store.delete("reasonDefinitions");
