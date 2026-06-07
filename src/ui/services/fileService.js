import { withTimeout } from "@/utils/ipcWithTimeout";

export const readFolders = () =>
  withTimeout(window.api.readFolders(), 15_000, "readFolders");
export const onReadFoldersProgress = (cb) => window.api.onReadFoldersProgress(cb);
export const submitBatch = (batch) =>
  withTimeout(window.api.submitBatch(batch), 30_000, "submitBatch");
export const openPreview = (filePath) =>
  withTimeout(window.api.openPreview(filePath), 5_000, "openPreview");
export const openInFolder = (filePath) =>
  withTimeout(window.api.openInFolder(filePath), 5_000, "openInFolder");
export const openInShopify = (orderName) =>
  withTimeout(window.api.openInShopify(orderName), 5_000, "openInShopify");
export const readFileBuffer = (filePath) =>
  withTimeout(window.api.readFileBuffer(filePath), 15_000, "readFileBuffer");
