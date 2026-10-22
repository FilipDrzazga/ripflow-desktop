import { ipcMain, shell } from "electron";
import { createEtsyImportRequests } from "../helpers/etsyImportRequests.js";
import { listOpenEtsyImports, requestEtsyImportRetry, dismissEtsyImport } from "../helpers/db.js";
import { getFeature } from "../helpers/shopProfile.js";
import { getSettings } from "../helpers/getSettings.js";
import { requestEtsyImportTick } from "./etsyImportLoop.js";
import { previewNewestEtsyOrder } from "./etsyPreview.js";
import { toIpcError } from "../helpers/ipcError.js";

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
    requestTick: requestEtsyImportTick,
    openExternal: (url) => shell.openExternal(url),
  });

  ipcMain.handle("etsy-imports:list", () => requests.list());
  ipcMain.handle("etsy-imports:retry", (_event, request) => requests.retry(request));
  ipcMain.handle("etsy-imports:dismiss", (_event, request) => requests.dismiss(request));
  ipcMain.handle("etsy-imports:openListing", (_event, listingId) => requests.openListing(listingId));

  // The dry run of Settings > Etsy: deliberately NOT behind featureOn - it is how a person finds out the flag is off.
  ipcMain.handle("etsy-imports:previewNewest", async () => {
    try {
      return { success: true, ...(await previewNewestEtsyOrder()) };
    } catch (error) {
      return { success: false, errors: [toIpcError(error, "etsy-preview", "Etsy check failed")] };
    }
  });
}
