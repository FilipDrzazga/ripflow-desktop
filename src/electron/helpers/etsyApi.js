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

  const accessToken = async () => {
    if (cached && now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached.token;
    const secrets = requireSecrets();
    if (!secrets.refreshToken) throw etsyError("ETSY_NOT_CONNECTED", "This station is not connected to Etsy. Press Connect.");
    const body = await postToken({ keystring: secrets.keystring, refreshToken: secrets.refreshToken });
    if (body.refresh_token && body.refresh_token !== secrets.refreshToken) credentials.saveRefreshToken(body.refresh_token);
    return cached.token;
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
    if (!body.refresh_token) throw etsyError("ETSY_TOKEN_FAILED", "Etsy sent no refresh token.");
    const who = await whoAmI(body.access_token);
    credentials.saveConnection({ refreshToken: body.refresh_token, ...who });
    return who;
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

  const forgetToken = () => {
    cached = null;
  };

  return { accessToken, get, completeSignIn, testConnection, forgetToken };
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
