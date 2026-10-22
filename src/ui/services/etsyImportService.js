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

// The listing's small picture as a data: URL (main fetches it from Etsy and keeps it).
export const getEtsyListingImage = (listingId) =>
  withTimeout(window.api.etsyImports.listingImage(String(listingId)), 20_000, "etsy-imports:listingImage");
// The ship-by date of each Etsy order in the list (plan ETA-2): { success, data: { [receiptId]: epoch s } } - an order with no
// date is not a key. Only digits cross, at most ETSY_SHIP_DATES_MAX of them.
export const getEtsyShipDates = (receiptIds) => withTimeout(window.api.etsyImports.shipDates(receiptIds), 10_000, "etsy-imports:shipDates");
// Settings > Etsy > Check newest order: a dry run, nothing is written. -> { receipt, lines, gate } or { success: false, errors }.
// 60 s: the Etsy call, a listing of the pattern folder on the share and the catalogue.
export const previewNewestEtsyOrder = () => withTimeout(window.api.etsyImports.previewNewest(), 60_000, "etsy-imports:previewNewest");
// "Import this order" (E5): the importer station imports ONE order now. -> { busy } or { ran, reason, imported, needsReview,
// failed, skipped }, or { success: false, errors }. 120 s: the Etsy call plus a copy per line to the share.
export const importEtsyOrder = (receiptId) => withTimeout(window.api.etsyImports.importOrder(String(receiptId)), 120_000, "etsy-imports:importOrder");
