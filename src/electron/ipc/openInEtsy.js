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

export const openInEtsy = async (orderName) => {
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

    await shell.openExternal(`https://www.etsy.com/your/orders/sold?order_id=${receiptId}`);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toIpcError(error, stage, "Open in Etsy failed"));
  }

  return result;
};
