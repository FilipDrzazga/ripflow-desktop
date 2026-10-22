import { withTimeout } from "@/utils/ipcWithTimeout";

// The Inbox bar of the Etsy import (plan E4). Every answer: { success, ... } or { success: false, error }.
// list -> { data: row[], importerHere }; retry -> { updated, importerHere }; dismiss -> { updated }.
// `updated: false` is not an error: someone else moved the line first, the bar reloads.
export const listEtsyImports = () => withTimeout(window.api.etsyImports.list(), 10_000, "etsy-imports:list");
export const retryEtsyImport = ({ receiptId, transactionId, xwd }) =>
  withTimeout(window.api.etsyImports.retry({ receiptId, transactionId, xwd: xwd ?? null }), 10_000, "etsy-imports:retry");
export const dismissEtsyImport = ({ receiptId, transactionId }) =>
  withTimeout(window.api.etsyImports.dismiss({ receiptId, transactionId }), 10_000, "etsy-imports:dismiss");
export const openEtsyListing = (listingId) =>
  withTimeout(window.api.etsyImports.openListing(String(listingId)), 5_000, "etsy-imports:openListing");
// Settings > Etsy > Check newest order: a dry run, nothing is written. -> { receipt, lines, gate } or { success: false, errors }.
// 60 s: the Etsy call, a listing of the pattern folder on the share and the catalogue.
export const previewNewestEtsyOrder = () => withTimeout(window.api.etsyImports.previewNewest(), 60_000, "etsy-imports:previewNewest");
