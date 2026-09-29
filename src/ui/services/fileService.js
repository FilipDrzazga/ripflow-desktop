import { withTimeout, MUTATING_TIMEOUT_MS } from "@/utils/ipcWithTimeout";
import { applyPrintOverrides } from "@/utils/applyPrintOverrides";

export const readFolders = () =>
  withTimeout(window.api.readFolders(), 15_000, "readFolders");
export const onReadFoldersProgress = (cb) => window.api.onReadFoldersProgress(cb);
// ETAP 4 (4-inbox): names only, every 30 s - a short deadline, a slow share just skips a round.
export const peekInbox = () => withTimeout(window.api.peekInbox(), 10_000, "inbox:peek");
export const submitBatch = (batch, overrides) => {
  // effectiveQty = manual override ?? reprintQty ?? parsed original - applied in
  // utils/applyPrintOverrides.js, shared with the print-length counter of the selection bar.
  const enriched = applyPrintOverrides(batch, overrides);
  return withTimeout(window.api.submitBatch(enriched), MUTATING_TIMEOUT_MS, "submitBatch");
};
export const openPreview = (filePath) =>
  withTimeout(window.api.openPreview(filePath), 5_000, "openPreview");
export const openInFolder = (filePath) =>
  withTimeout(window.api.openInFolder(filePath), 5_000, "openInFolder");
export const openInShopify = (orderName) =>
  withTimeout(window.api.openInShopify(orderName), 5_000, "openInShopify");
export const readFileBuffer = (filePath) =>
  withTimeout(window.api.readFileBuffer(filePath), 15_000, "readFileBuffer");
