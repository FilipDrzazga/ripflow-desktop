import { shell } from "electron";
import { toIpcError } from "../helpers/ipcError.js";
import { SHOPIFY_STORE_HANDLE } from "../helpers/shopifyConfig.js";

const STAGES = {
  INIT: "init",
  VALIDATE: "validate",
  OPEN: "open",
  DONE: "done",
};

export const openInShopify = async (orderName) => {
  const result = {
    success: false,
    errors: [],
    warnings: [],
  };

  let stage = STAGES.INIT;

  try {
    stage = STAGES.VALIDATE;

    if (typeof orderName !== "string" || orderName.trim() === "") {
      throw Object.assign(new Error("Order name must be a non-empty string."), {
        code: "INVALID_ORDER_NAME",
        title: "Open in Shopify failed",
      });
    }

    stage = STAGES.OPEN;

    const url = `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/orders/?query=${encodeURIComponent(orderName)}`;
    await shell.openExternal(url);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toIpcError(error, stage, "Open in Shopify failed"));
  }

  return result;
};
