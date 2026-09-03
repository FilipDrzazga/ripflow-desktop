import { shell } from "electron";
import { toIpcError } from "../helpers/ipcError.js";
import { getProfile, getFeature } from "../helpers/shopProfile.js";

// The shop-wide profile is the ONLY source of the store handle. There is deliberately
// no DEFAULT_PROFILE fallback any more: it resolved to "fashionformulauk", so a client
// with features.shopify on and no handle of their own - or any station whose profile
// could not be read - was sent to the admin panel of ANOTHER shop. Not an error page,
// not a blank one: someone else's orders. Dead today because Alex is the only client
// and has a handle, live the minute there is a second one.
// Empty string and whitespace count as missing, so an unusable handle can never build
// a valid-looking URL.
const getStoreHandle = () => {
  const handle = getProfile()?.integrations?.shopify?.storeHandle;
  return typeof handle === "string" && handle.trim() !== "" ? handle.trim() : null;
};

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

    // Fail-closed first, before anything else is even looked at: getFeature returns
    // false for an unreadable profile, so a shop we know nothing about opens nothing.
    // Gated in main as well as at the four renderer call sites for the same reason as
    // label:printBatch (238ac1c) - this handler performs an effect, it opens a browser,
    // and 2e rewrites the renderer broadly.
    if (!getFeature("shopify")) {
      throw Object.assign(new Error("The Shopify integration is not enabled for this shop."), {
        code: "SHOPIFY_DISABLED",
        title: "Open in Shopify failed",
      });
    }

    if (typeof orderName !== "string" || orderName.trim() === "") {
      throw Object.assign(new Error("Order name must be a non-empty string."), {
        code: "INVALID_ORDER_NAME",
        title: "Open in Shopify failed",
      });
    }

    // A missing handle is now an explicit, visible failure instead of a silent
    // substitution. The operator learns the profile is incomplete; nobody lands in
    // a stranger's Shopify admin.
    const storeHandle = getStoreHandle();
    if (!storeHandle) {
      throw Object.assign(new Error("No Shopify store handle is configured for this shop."), {
        code: "MISSING_STORE_HANDLE",
        title: "Open in Shopify failed",
      });
    }

    stage = STAGES.OPEN;

    const url = `https://admin.shopify.com/store/${storeHandle}/orders/?query=${encodeURIComponent(orderName)}`;
    await shell.openExternal(url);

    result.success = true;
    stage = STAGES.DONE;
  } catch (error) {
    result.errors.push(toIpcError(error, stage, "Open in Shopify failed"));
  }

  return result;
};
