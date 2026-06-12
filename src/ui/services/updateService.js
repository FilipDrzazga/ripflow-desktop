export const getAppVersion = () => window.api.getAppVersion();
export const checkForUpdate = () => window.api.update.check();
export const installUpdate = () => window.api.update.install();
export const onUpdateAvailable = (cb) => window.api.update.onAvailable(cb);
export const onUpdateProgress = (cb) => window.api.update.onProgress(cb);
export const onUpdateReady = (cb) => window.api.update.onReady(cb);
export const onUpdateNotAvailable = (cb) => window.api.update.onNotAvailable?.(cb) ?? (() => {});
export const onUpdateError = (cb) => window.api.update.onError(cb);
