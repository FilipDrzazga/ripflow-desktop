import { ETSY_TOKEN_URL, tokenRequestBody, userIdOfToken } from "./etsyOAuth.js";

// Etsy Open API v3 client of this station: tokens and plain GETs. No window and no Electron -
// the sign-in window lives in etsyConnectWindow.js, the IPC in ipc/etsyHandlers.js.
//
//   credentials: createEtsyCredentials(...) (etsyCredentials.js)
//   fetch:       the global fetch, injected for the tests
//
// The access token lives one hour and is kept in memory only; the 90-day refresh token is the
// one thing on disk (encrypted). Every request carries x-api-key "<keystring>:<shared secret>"
// (Etsy, Request Standards) and, for anything shop-specific, the bearer token.

export const ETSY_API_BASE = "https://api.etsy.com/v3/application";

// Refresh a minute early: a token that expires between the check and Etsy reading it would
// fail a request that had every reason to work.
const EXPIRY_MARGIN_MS = 60 * 1000;

const RECEIPT_PAGE_SIZE = 100; // Etsy's maximum for getShopReceipts
const MAX_RECEIPT_PAGES = 50;

const etsyError = (code, message, extra = {}) => Object.assign(new Error(message), { code, title: "Etsy", ...extra });

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const createEtsyClient = ({ credentials, fetch, now = () => Date.now() }) => {
  let cached = null; // { token, expiresAt }

  const requireSecrets = () => {
    const secrets = credentials.secrets();
    if (!secrets) throw etsyError("ETSY_NO_KEY", "No Etsy key on this station. Enter the keystring and shared secret first.");
    return secrets;
  };

  const postToken = async (grant) => {
    let response;
    try {
      response = await fetch(ETSY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenRequestBody(grant),
      });
    } catch (err) {
      throw etsyError("ETSY_UNREACHABLE", `Etsy could not be reached: ${err.message}`);
    }
    const body = await readJson(response);
    if (!response.ok || !body?.access_token) {
      const reason = body?.error_description || body?.error || `HTTP ${response.status}`;
      // invalid_grant on a refresh = the 90 days are over or the seller revoked the app.
      const code = grant.refreshToken && body?.error === "invalid_grant" ? "ETSY_RECONNECT" : "ETSY_TOKEN_FAILED";
      const message = code === "ETSY_RECONNECT" ? `Etsy needs signing in again (${reason}). Press Connect.` : `Etsy refused the sign-in: ${reason}`;
      throw etsyError(code, message);
    }
    cached = { token: body.access_token, expiresAt: now() + Number(body.expires_in || 3600) * 1000 };
    return body;
  };

  // ONE refresh at a time (D74): the import runs in the background beside "Test connection", and two
  // callers finding the token expired together would send the same refresh token twice. Etsy rotates
  // refresh tokens, so the second answer can be invalid_grant (ETSY_RECONNECT) and two refresh tokens
  // would be saved. The second caller waits for the first one's token.
  let refreshing = null;

  const refresh = async () => {
    const secrets = requireSecrets();
    if (!secrets.refreshToken) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    const body = await postToken({ keystring: secrets.keystring, refreshToken: secrets.refreshToken });
    if (body.refresh_token && body.refresh_token !== secrets.refreshToken) credentials.saveRefreshToken(body.refresh_token);
    return cached.token;
  };

  const accessToken = async () => {
    if (cached && now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached.token;
    if (!refreshing) {
      refreshing = refresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };

  // GET <ETSY_API_BASE><path>. token: an explicit bearer (the sign-in, before anything is saved).
  const get = async (path, { query, token } = {}) => {
    const secrets = requireSecrets();
    const bearer = token ?? (await accessToken());
    const url = new URL(`${ETSY_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          "x-api-key": `${secrets.keystring}:${secrets.sharedSecret}`,
          Authorization: `Bearer ${bearer}`,
        },
      });
    } catch (err) {
      throw etsyError("ETSY_UNREACHABLE", `Etsy could not be reached: ${err.message}`);
    }
    const body = await readJson(response);
    if (!response.ok) {
      const reason = body?.error || `HTTP ${response.status}`;
      if (response.status === 401) cached = null;
      throw etsyError("ETSY_REQUEST_FAILED", `Etsy answered ${response.status} for ${path}: ${reason}`, { status: response.status });
    }
    return body;
  };

  // The seller behind a token: user id and shop. A user without a shop cannot sell, so there
  // is nothing to import for them - refused.
  const whoAmI = async (token) => {
    const me = await get("/users/me", { token });
    const shopId = me?.shop_id ?? null;
    if (!shopId) throw etsyError("ETSY_NO_SHOP", "This Etsy account has no shop. Sign in with the shop owner's account.");
    const shop = await get(`/shops/${shopId}`, { token });
    return { userId: me.user_id ?? userIdOfToken(token), shopId, shopName: shop?.shop_name ?? null };
  };

  // The end of the sign-in: code -> tokens -> which shop -> saved. Nothing is saved before the
  // shop is known, so a half-finished sign-in leaves the previous state as it was.
  const completeSignIn = async ({ code, verifier }) => {
    const secrets = requireSecrets();
    const body = await postToken({ keystring: secrets.keystring, code, verifier });
    try {
      if (!body.refresh_token) throw etsyError("ETSY_TOKEN_FAILED", "Etsy sent no refresh token.");
      const who = await whoAmI(body.access_token);
      credentials.saveConnection({ refreshToken: body.refresh_token, ...who });
      return who;
    } catch (err) {
      // postToken cached the new account's access token before the shop was known (D74): a sign-in that
      // ends here saved nothing, so the memory must not keep a token the disk does not know about.
      cached = null;
      throw err;
    }
  };

  // The open orders of the connected shop: paid, not shipped, not cancelled, created at or after
  // `minCreated` (epoch seconds). Etsy pages by 100; every page is read, because an order that is
  // not listed here is an order that is never imported. A shop with more open orders than the
  // cap is refused loudly rather than cut short.
  const listOpenReceipts = async ({ minCreated }) => {
    const { shopId } = credentials.status();
    if (!shopId) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    const receipts = [];
    for (let page = 0; page < MAX_RECEIPT_PAGES; page += 1) {
      const body = await get(`/shops/${shopId}/receipts`, {
        query: {
          limit: RECEIPT_PAGE_SIZE,
          offset: page * RECEIPT_PAGE_SIZE,
          was_paid: true,
          was_shipped: false,
          was_canceled: false,
          min_created: minCreated,
          sort_on: "created",
          sort_order: "asc",
        },
      });
      const results = Array.isArray(body?.results) ? body.results : [];
      receipts.push(...results);
      if (results.length < RECEIPT_PAGE_SIZE) return receipts;
    }
    throw etsyError("ETSY_TOO_MANY_ORDERS", `More than ${MAX_RECEIPT_PAGES * RECEIPT_PAGE_SIZE} open Etsy orders - the import stopped instead of reading only a part.`);
  };

  // "Test connection": the shop and its newest paid order, cut down to what the import will
  // read (plan E2/E3) - where the pattern number (XWD) sits, the fabric and the print type. No
  // buyer name or address leaves this function.
  const testConnection = async () => {
    const { shopId } = credentials.status();
    if (!shopId) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    const shop = await get(`/shops/${shopId}`);
    const receipts = await get(`/shops/${shopId}/receipts`, {
      query: { limit: 1, was_paid: true, sort_on: "created", sort_order: "desc" },
    });
    return { shop: { id: shopId, name: shop?.shop_name ?? null }, paidOrders: receipts?.count ?? null, latest: summarizeReceipt(receipts?.results?.[0]) };
  };

  // The newest paid order WITH its lines, as Etsy sends it (the dry run of the import reads it; nothing is cut
  // down here - the caller shows only what it needs). null = the shop has no paid order yet.
  const newestPaidReceipt = async () => {
    const { shopId } = credentials.status();
    if (!shopId) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    const receipts = await get(`/shops/${shopId}/receipts`, {
      query: { limit: 1, was_paid: true, sort_on: "created", sort_order: "desc" },
    });
    return receipts?.results?.[0] ?? null;
  };

  // ONE receipt of the connected shop, with its lines (getShopReceipt), for "Import this order" (E5). The number
  // goes into the path, so anything but digits is refused before a request is made.
  const getReceipt = async (receiptId) => {
    const { shopId } = credentials.status();
    if (!shopId) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    if (!/^\d{1,20}$/.test(String(receiptId ?? ""))) throw etsyError("ETSY_BAD_RECEIPT", "The Etsy order number must be digits only.");
    return get(`/shops/${shopId}/receipts/${receiptId}`);
  };

  const forgetToken = () => {
    cached = null;
  };

  return { accessToken, get, completeSignIn, testConnection, listOpenReceipts, newestPaidReceipt, getReceipt, forgetToken };
};

export const summarizeReceipt = (receipt) => {
  if (!receipt) return null;
  return {
    receiptId: receipt.receipt_id ?? null,
    created: Number.isFinite(receipt.create_timestamp) ? new Date(receipt.create_timestamp * 1000).toISOString() : null,
    items: (Array.isArray(receipt.transactions) ? receipt.transactions : []).map((t) => ({
      title: t.title ?? null,
      listingId: t.listing_id ?? null,
      productId: t.product_id ?? null,
      sku: t.sku ?? null,
      quantity: t.quantity ?? null,
      variations: (Array.isArray(t.variations) ? t.variations : []).map((v) => ({ name: v.formatted_name ?? null, value: v.formatted_value ?? null })),
    })),
  };
};

// What the dry run says of the ORDER itself (no buyer data): its number, when it was placed, and whether the
// background import would list it - placed at or after `since` (epoch seconds the import was switched on) and not
// shipped. null = Etsy did not say / there is no start date.
export const receiptFacts = (receipt, since) => {
  const created = Number.isFinite(receipt?.create_timestamp) ? receipt.create_timestamp : null;
  return {
    receiptId: receipt?.receipt_id === undefined || receipt?.receipt_id === null ? null : String(receipt.receipt_id),
    created: created === null ? null : new Date(created * 1000).toISOString(),
    afterStart: created !== null && Number.isInteger(since) && since > 0 ? created >= since : null,
    shipped: typeof receipt?.is_shipped === "boolean" ? receipt.is_shipped : null,
  };
};
