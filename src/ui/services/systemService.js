export const getLogs = () => window.api.getLogs();
export const clearLogs = () => window.api.clearLogs();
export const getHeldFiles = () => window.api.getHeldFiles();
export const holdFile = (fileId) => window.api.holdFile(fileId);
export const unholdFile = (fileId) => window.api.unholdFile(fileId);
export const minimizeWindow = () => window.api.minimizeWindow();
export const closeWindow = () => window.api.closeWindow();
export const showConfirm = (message) => window.api.showConfirm(message);
