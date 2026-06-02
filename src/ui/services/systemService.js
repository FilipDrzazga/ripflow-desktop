export const getLogs = () => window.api.getLogs();
export const clearLogs = () => window.api.clearLogs();
export const getHeldFiles = () => window.api.getHeldFiles();
export const holdFile = (fileId, reason = "") => window.api.holdFile(fileId, reason);
export const unholdFile = (fileId) => window.api.unholdFile(fileId);
export const minimizeWindow = () => window.api.minimizeWindow();
export const closeWindow = () => window.api.closeWindow();
export const showConfirm = (message) => window.api.showConfirm(message);
