import { withTimeout } from "@/utils/ipcWithTimeout";

export const getLogs = () =>
  withTimeout(window.api.getLogs(), 5_000, "getLogs");
export const clearLogs = () =>
  withTimeout(window.api.clearLogs(), 5_000, "clearLogs");
export const getHeldFiles = () =>
  withTimeout(window.api.getHeldFiles(), 5_000, "getHeldFiles");
export const holdFile = (fileId, reason = "") =>
  withTimeout(window.api.holdFile(fileId, reason), 5_000, "holdFile");
export const unholdFile = (fileId) =>
  withTimeout(window.api.unholdFile(fileId), 5_000, "unholdFile");
// fire-and-forget IPC sends — no invoke, no timeout needed
export const minimizeWindow = () => window.api.minimizeWindow();
export const closeWindow = () => window.api.closeWindow();
// no timeout — user drives the dialog
export const showConfirm = (message) => window.api.showConfirm(message);
