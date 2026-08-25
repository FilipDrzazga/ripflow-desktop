// Stub for src/electron/helpers/getSettings.js, injected by loader.mjs.
// Pins the paths that reach <Path> so a capture does not depend on the operator's
// electron-store. Values are Alex's real ones, so the baseline stays realistic.
// <Path> is normalized at compare time anyway (see mask.mjs) - this is belt and braces.
const settings = {
  storagePath: "O:" + String.fromCharCode(92) + "SPPrintReadyArtwork",
  xmlPath: "O:" + String.fromCharCode(92) + "SPPrintReadyArtwork",
  workstationName: "GOLDEN",
  customOrderFolderPath: "",
  labelPrinterName: "",
  workstationRole: "",
  shippedRetentionDays: 30,
  batchHistoryEagerDays: 7,
  labelPrintMode: "manual",
  clientId: "all",
};

export const getSettings = () => ({ ...settings });
export const setSettings = () => {};
