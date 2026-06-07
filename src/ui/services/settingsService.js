import { withTimeout } from "@/utils/ipcWithTimeout";

export const getSettings = () =>
  withTimeout(window.api.getSettings(), 5_000, "getSettings");
export const setSettings = (settings) =>
  withTimeout(window.api.setSettings(settings), 30_000, "setSettings");
// no timeout — user drives the dialog
export const selectFolder = () => window.api.selectFolder();
export const backupDb = () =>
  withTimeout(window.api.backupDb(), 30_000, "backupDb");
