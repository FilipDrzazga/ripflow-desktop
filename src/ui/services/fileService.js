import { withTimeout } from "@/utils/ipcWithTimeout";

export const readFolders = () =>
  withTimeout(window.api.readFolders(), 15_000, "readFolders");
export const onReadFoldersProgress = (cb) => window.api.onReadFoldersProgress(cb);
export const submitBatch = (batch, overrides) => {
  const enriched = overrides
    ? batch.map((item) => {
        const ov = overrides.get(item.id);
        if (!ov) return item;
        return {
          ...item,
          ...(ov.qty != null ? { qty: ov.qty, qtyOverride: ov.qty, _originalQty: item.qty, _qtyOverridden: true } : {}),
          ...(ov.meters != null ? { height: Math.round(ov.meters * 1000), metersOverride: ov.meters, _originalHeight: item.height, _heightOverridden: true } : {}),
        };
      })
    : batch;
  return withTimeout(window.api.submitBatch(enriched), 30_000, "submitBatch");
};
export const openPreview = (filePath) =>
  withTimeout(window.api.openPreview(filePath), 5_000, "openPreview");
export const openInFolder = (filePath) =>
  withTimeout(window.api.openInFolder(filePath), 5_000, "openInFolder");
export const openInShopify = (orderName) =>
  withTimeout(window.api.openInShopify(orderName), 5_000, "openInShopify");
export const readFileBuffer = (filePath) =>
  withTimeout(window.api.readFileBuffer(filePath), 15_000, "readFileBuffer");
