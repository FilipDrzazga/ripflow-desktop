import { shell } from "electron";
import { toIpcError } from "../helpers/ipcError.js";
import { getProfile } from "../helpers/shopProfile.js";
import { DEFAULT_PROFILE } from "../helpers/defaultProfile.js";

// The shop-wide profile is the source; DEFAULT_PROFILE is the degraded-mode fallback,
// used when the cache is null (DB unreachable) or the row carries no handle. Falling
// back keeps the link working instead of stopping the operator - and it is the SAME
// literal the profile is seeded from, so there is one definition, not two.
// Empty string counts as missing, hence || rather than ??: an empty handle would build
// a valid-looking URL pointing at no store.
const getStoreHandle = () =>
  getProfile()?.integrations?.shopify?.storeHandle ||
  DEFAULT_PROFILE.integrations.shopify.storeHandle;

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

    const url = `https://admin.shopify.com/store/${getStoreHandle()}/orders/?query=${encodeURIComponent(orderName)}`;
    await shell.openExternal(url);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toIpcError(error, stage, "Open in Shopify failed"));
  }

  return result;
};
