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

// Plan FAB: the fabric chosen for a line is remembered for its listing; listingFabrics -> { data: { [listingId]: name } }.
export const setEtsyListingFabric = ({ receiptId, transactionId, fabric }) =>
  withTimeout(window.api.etsyImports.setListingFabric({ receiptId, transactionId, fabric }), 10_000, "etsy-imports:setListingFabric");
export const listEtsyListingFabrics = () => withTimeout(window.api.etsyImports.listingFabrics(), 10_000, "etsy-imports:listingFabrics");
export const forgetEtsyListingFabric = (listingId) =>
  withTimeout(window.api.etsyImports.forgetListingFabric(String(listingId)), 10_000, "etsy-imports:forgetListingFabric");

// Settings > Etsy: what is remembered per listing, in one answer: { data: [{ listingId, title, fabric, printType }] }.
export const listEtsyListingChoices = () => withTimeout(window.api.etsyImports.listingChoices(), 10_000, "etsy-imports:listingChoices");
// Plan FAB-3c: the print type chosen for a line is remembered for its listing; listingPrintTypes -> { data: { [listingId]: code } }.
export const setEtsyListingPrintType = ({ receiptId, transactionId, printType }) =>
  withTimeout(window.api.etsyImports.setListingPrintType({ receiptId, transactionId, printType }), 10_000, "etsy-imports:setListingPrintType");
export const listEtsyListingPrintTypes = () => withTimeout(window.api.etsyImports.listingPrintTypes(), 10_000, "etsy-imports:listingPrintTypes");
export const forgetEtsyListingPrintType = (listingId) =>
  withTimeout(window.api.etsyImports.forgetListingPrintType(String(listingId)), 10_000, "etsy-imports:forgetListingPrintType");

// The listing's small picture as a data: URL (main fetches it from Etsy and keeps it).
export const getEtsyListingImage = (listingId) =>
  withTimeout(window.api.etsyImports.listingImage(String(listingId)), 20_000, "etsy-imports:listingImage");
// The ship-by date and the buyer's note of each Etsy order in the list (plans ETA-2 / MSG-2): { success, data: { [receiptId]:
// { shipBy: epoch s | null, buyerNote: text | null } } } - an order with neither is not a key. Only digits cross, at most ETSY_SHIP_DATES_MAX of them.
export const getEtsyShipDates = (receiptIds) => withTimeout(window.api.etsyImports.shipDates(receiptIds), 10_000, "etsy-imports:shipDates");
// Settings > Etsy > Check newest order: a dry run, nothing is written. -> { receipt, lines, gate } or { success: false, errors }.
// 60 s: the Etsy call, a listing of the pattern folder on the share and the catalogue.
export const previewNewestEtsyOrder = () => withTimeout(window.api.etsyImports.previewNewest(), 60_000, "etsy-imports:previewNewest");
// "Import this order" (E5): the importer station imports ONE order now. -> { busy } or { ran, reason, imported, needsReview,
// failed, skipped }, or { success: false, errors }. 120 s: the Etsy call plus a copy per line to the share.
export const importEtsyOrder = (receiptId) => withTimeout(window.api.etsyImports.importOrder(String(receiptId)), 120_000, "etsy-imports:importOrder");
