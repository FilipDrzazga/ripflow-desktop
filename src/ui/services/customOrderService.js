import { withTimeout } from "@/utils/ipcWithTimeout";

export const scanCustomOrderFolder = () =>
  withTimeout(window.api.customOrder.scanFolder(), 15_000, "scanCustomOrderFolder");
export const importCSVContent = (content) =>
  withTimeout(window.api.customOrder.importCSVContent(content), 15_000, "importCSVContent");
export const generateCustomOrderXML = (group) =>
  withTimeout(window.api.customOrder.generateXML(group), 30_000, "generateCustomOrderXML");
export const getCustomOrderHistory = () =>
  withTimeout(window.api.customOrder.getHistory(), 5_000, "getCustomOrderHistory");
export const clearCustomOrderHistory = () =>
  withTimeout(window.api.customOrder.clearHistory(), 5_000, "clearCustomOrderHistory");
export const deleteCustomOrder = (id) =>
  withTimeout(window.api.customOrder.deleteOrder(id), 5_000, "deleteCustomOrder");
// no timeout — user drives the dialog
export const selectCustomOrderCSV = () => window.api.customOrder.selectCSV();
