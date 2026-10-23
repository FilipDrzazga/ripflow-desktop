import { ipcMain, shell } from "electron";
import { createEtsyImportRequests, etsyReceiptIdOf } from "../helpers/etsyImportRequests.js";
import {
  listOpenEtsyImports,
  requestEtsyImportRetry,
  dismissEtsyImport,
  listEtsyShipDates,
  getEtsyImport,
  getAllFabrics,
  getEtsyListingFabrics,
  setEtsyListingFabric,
  deleteEtsyListingFabric,
} from "../helpers/db.js";
import { getFeature } from "../helpers/shopProfile.js";
import { getSettings } from "../helpers/getSettings.js";
import { requestEtsyImportTick, importEtsyReceiptNow } from "./etsyImportLoop.js";
import { previewNewestEtsyOrder } from "./etsyPreview.js";
import { toIpcError } from "../helpers/ipcError.js";
import { createEtsyThumbnails } from "../helpers/etsyThumbnail.js";
import { getEtsyParts } from "./etsyHandlers.js";

// The Inbox bar's three calls (plan E4). The rules are in helpers/etsyImportRequests.js; this file only
// supplies the real parts. Kept apart from etsyHandlers.js on purpose: that file is the station's Etsy
// connection and never touches the shared database, these calls are nothing but the shared database.
export function registerEtsyImportHandlers() {
  const requests = createEtsyImportRequests({
    featureOn: () => getFeature("etsy"),
    isImporter: () => getSettings().etsyImportEnabled === true,
    list: listOpenEtsyImports,
    requestRetry: requestEtsyImportRetry,
    dismiss: dismissEtsyImport,
    getLine: getEtsyImport,
    hasFabric: (name) => (getAllFabrics() ?? []).some((f) => f.name === name),
    listListingFabrics: getEtsyListingFabrics,
    saveListingFabric: setEtsyListingFabric,
    forgetListingFabric: deleteEtsyListingFabric,
    requestTick: requestEtsyImportTick,
    shipDates: listEtsyShipDates,
    openExternal: (url) => shell.openExternal(url),
    listingImage: createEtsyThumbnails({
      thumbnailUrl: (listingId) => getEtsyParts().client.listingThumbnailUrl(listingId),
      fetch: (...args) => fetch(...args),
    }),
  });

  ipcMain.handle("etsy-imports:list", () => requests.list());
  ipcMain.handle("etsy-imports:retry", (_event, request) => requests.retry(request));
  ipcMain.handle("etsy-imports:setListingFabric", (_event, request) => requests.setListingFabric(request));
  ipcMain.handle("etsy-imports:listingFabrics", () => requests.listingFabrics());
  ipcMain.handle("etsy-imports:forgetListingFabric", (_event, listingId) => requests.forgetListingFabric(listingId));
  ipcMain.handle("etsy-imports:dismiss", (_event, request) => requests.dismiss(request));
  ipcMain.handle("etsy-imports:openListing", (_event, listingId) => requests.openListing(listingId));
  ipcMain.handle("etsy-imports:shipDates", (_event, receiptIds) => requests.shipDates(receiptIds));
  ipcMain.handle("etsy-imports:listingImage", (_event, listingId) => requests.listingImage(listingId));

  // The dry run of Settings > Etsy: deliberately NOT behind featureOn - it is how a person finds out the flag is off.
  ipcMain.handle("etsy-imports:previewNewest", async () => {
    try {
      return { success: true, ...(await previewNewestEtsyOrder()) };
    } catch (error) {
      return { success: false, errors: [toIpcError(error, "etsy-preview", "Etsy check failed")] };
    }
  });

  // "Import this order" (E5): only the number crosses; main fetches the order from Etsy itself. Not behind
  // featureOn here - the import's own gate asks it (with everything else) and says which one is missing.
  ipcMain.handle("etsy-imports:importOrder", async (_event, receiptId) => {
    try {
      return { success: true, ...(await importEtsyReceiptNow(etsyReceiptIdOf(receiptId))) };
    } catch (error) {
      return { success: false, errors: [toIpcError(error, "etsy-import-order", "Etsy order import failed")] };
    }
  });
}
