export const readFolders = () => window.api.readFolders();
export const onReadFoldersProgress = (cb) => window.api.onReadFoldersProgress(cb);
export const submitBatch = (batch) => window.api.submitBatch(batch);
export const openPreview = (filePath) => window.api.openPreview(filePath);
export const openInFolder = (filePath) => window.api.openInFolder(filePath);
export const openInShopify = (orderName) => window.api.openInShopify(orderName);
export const readFileBuffer = (filePath) => window.api.readFileBuffer(filePath);
