// Which "Open in ..." entry the context menus offer for an order, and the Etsy opener they share.
// One decision for the four menus (Inbox, BatchHistory, Production Batches + Receive), so an
// Etsy order can never be sent to the Shopify search in one view and to Etsy in another.

import { ORDER_SOURCE, orderSourceOf } from "../../shared/orderSource";
import { isFeatureEnabled } from "./featureVisibility";
import { openInEtsy as openInEtsyApi } from "../services/fileService";
import { notify } from "./notify";

export const ORDER_LINK = Object.freeze({
  SHOPIFY: "shopify",
  ETSY: "etsy",
});

// The order number of a file: the parsed one, else the first ON<digits> / ET<digits> in the
// file name (a BatchHistory row read from disk, an inbox row parsed before the field existed).
export const orderIdOf = (orderId, fileName) => {
  if (typeof orderId === "string" && orderId.trim() !== "") return orderId;
  return String(fileName ?? "").match(/(?:ON|ET)\d+/i)?.[0]?.toUpperCase() ?? null;
};

// ORDER_LINK.ETSY for an Etsy order (no feature flag: see openInEtsy.js in main), otherwise
// ORDER_LINK.SHOPIFY when the shop has features.shopify on - exactly the old condition, so a
// row with no order number keeps its Shopify entry and the "No order number" warning - else null.
export const orderLinkFor = (orderId, profile) => {
  if (orderSourceOf(orderId) === ORDER_SOURCE.ETSY) return ORDER_LINK.ETSY;
  return isFeatureEnabled("shopify", profile) ? ORDER_LINK.SHOPIFY : null;
};

export const openEtsyOrder = async (orderId) => {
  const res = await openInEtsyApi(orderId);
  if (!res?.success) {
    const err = res?.errors?.[0];
    notify(
      {
        type: err?.type || "Error",
        title: err?.title || "Open in Etsy failed",
        message: err?.message || "Could not open the Etsy order.",
      },
      { stage: "app", code: "OPEN_ETSY_FAILED" },
    );
  }
};
