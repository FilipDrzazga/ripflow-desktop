import { shell } from "electron";
import { toIpcError } from "../helpers/ipcError.js";
import { etsyReceiptId } from "../../shared/orderSource.js";

// Opens an Etsy order in the seller's Shop Manager. The order number in the file name is
// "ET<receipt id>" (src/shared/orderSource.js); the receipt id is the whole address.
//
// No feature flag and no store handle, unlike openInShopify: the Shop Manager address carries
// no shop name, and Etsy shows an order only to the signed-in seller it belongs to, so there
// is no foreign shop this link could open. The gate is the order number itself - only a file
// named as an Etsy order offers the menu item, and anything else is refused here.
const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  OPEN: "open",
  DONE: "done",
};

// `conversation: true` (plan MSG-3) opens the same page with the buyer conversation expanded, the address Etsy's own
// "Message buyer" button leads to (FILIP 2026-10-23, from the browser's address bar). It adds no number: the receipt id is
// still the only thing built into the address.
const ORDER_URL = "https://www.etsy.com/your/orders/sold?order_id=";
const CONVERSATION_URL = "https://www.etsy.com/your/orders/sold?ref=seller-platform-mcnav&expand_convo=true&order_id=";

export const openInEtsy = async (orderName, { conversation = false } = {}) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
  };

  let stage = STAGES.INIT;

  try {
    stage = STAGES.VALIDATE;

    const receiptId = etsyReceiptId(orderName);
    if (!receiptId) {
      throw Object.assign(new Error("Not an Etsy order number (expected ET followed by the receipt number)."), {
        code: "INVALID_ETSY_ORDER",
        title: "Open in Etsy failed",
      });
    }

    stage = STAGES.OPEN;

    await shell.openExternal(`${conversation === true ? CONVERSATION_URL : ORDER_URL}${receiptId}`);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toIpcError(error, stage, "Open in Etsy failed"));
  }

  return result;
};
