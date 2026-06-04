export const scanCustomOrderFolder = () => window.api.customOrder.scanFolder();
export const importCSVContent = (content) => window.api.customOrder.importCSVContent(content);
export const generateCustomOrderXML = (group) => window.api.customOrder.generateXML(group);
export const getCustomOrderHistory = () => window.api.customOrder.getHistory();
export const clearCustomOrderHistory = () => window.api.customOrder.clearHistory();
export const selectCustomOrderCSV = () => window.api.customOrder.selectCSV();
