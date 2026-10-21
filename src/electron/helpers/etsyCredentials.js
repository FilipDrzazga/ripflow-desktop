// The Etsy connection of THIS station: the app key (keystring + shared secret) and the 90-day
// refresh token. Per machine, never in the shared ripflow.db on the NAS (rule 25: the shop
// profile carries rules, not a station's keys). Kept in an electron-store file of its own
// (etsy.json next to config.json), so settings:get - a whitelist - can never hand it to the
// renderer, and settings:set (spread-then-override, rule 4) can never write it back.
//
// Every secret is written ENCRYPTED (Electron safeStorage = Windows DPAPI, bound to the Windows
// user of this PC). No encryption available = nothing is written: a key in plain text on disk
// is worse than no Etsy connection.
//
// Built from injected parts so the tests need neither Electron nor a real file:
//   store: { get(key), set(key, value), delete(key) }
//   crypt: { available() -> boolean, encrypt(text) -> string, decrypt(string) -> text (throws) }

export const REFRESH_TOKEN_LIFETIME_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const SECRET_KEYS = ["keystring", "sharedSecret", "refreshToken"];
const CONNECTION_KEYS = ["refreshToken", "refreshSavedAt", "userId", "shopId", "shopName", "connectedAt"];

const etsyError = (code, message) => Object.assign(new Error(message), { code, title: "Etsy" });

// An Etsy keystring and shared secret are short runs of letters and digits; anything with a
// space or a separator is a paste gone wrong (a whole line, a label, two values at once).
const KEY_PART_RE = /^[A-Za-z0-9_-]{1,200}$/;

export const createEtsyCredentials = ({ store, crypt, now = () => new Date() }) => {
  const readSecret = (key) => {
    const stored = store.get(key);
    if (typeof stored !== "string" || stored === "") return null;
    return crypt.decrypt(stored);
  };

  const writeSecret = (key, value) => store.set(key, crypt.encrypt(value));

  const requireEncryption = () => {
    if (!crypt.available()) {
      throw etsyError("ETSY_ENCRYPTION_UNAVAILABLE", "Windows cannot encrypt data for this user, so RipFlow will not store Etsy keys here.");
    }
  };

  // All three secrets in clear text, for the main process only - or null when there is no key.
  // A value this Windows user cannot decrypt (the file was copied from another PC or user)
  // throws ETSY_KEY_UNREADABLE: the key must be entered again, never guessed around.
  const secrets = () => {
    try {
      const values = Object.fromEntries(SECRET_KEYS.map((key) => [key, readSecret(key)]));
      if (!values.keystring || !values.sharedSecret) return null;
      return values;
    } catch {
      throw etsyError("ETSY_KEY_UNREADABLE", "The saved Etsy key cannot be read on this Windows account. Enter the key again.");
    }
  };

  // What the renderer may see: no secret, only enough to recognise the key and the shop.
  const status = () => {
    const encryption = crypt.available();
    let values = null;
    let readable = true;
    try {
      values = secrets();
    } catch {
      readable = false;
    }
    const refreshSavedAt = store.get("refreshSavedAt") ?? null;
    const connected = !!values?.refreshToken;
    return {
      encryption,
      readable,
      hasKey: !!values,
      keyHint: values ? `...${values.keystring.slice(-4)}` : null,
      connected,
      userId: connected ? (store.get("userId") ?? null) : null,
      shopId: connected ? (store.get("shopId") ?? null) : null,
      shopName: connected ? (store.get("shopName") ?? null) : null,
      connectedAt: connected ? (store.get("connectedAt") ?? null) : null,
      refreshExpiresAt:
        connected && refreshSavedAt ? new Date(Date.parse(refreshSavedAt) + REFRESH_TOKEN_LIFETIME_DAYS * DAY_MS).toISOString() : null,
    };
  };

  const clearConnection = () => {
    for (const key of CONNECTION_KEYS) store.delete(key);
  };

  // A new key belongs to another Etsy app (or a regenerated one): the old sign-in is not valid
  // for it, so it goes. The same key saved again keeps the connection.
  const saveKey = ({ keystring, sharedSecret } = {}) => {
    const key = String(keystring ?? "").trim();
    const secret = String(sharedSecret ?? "").trim();
    if (!KEY_PART_RE.test(key) || !KEY_PART_RE.test(secret)) {
      throw etsyError("ETSY_KEY_INVALID", "Paste the keystring and the shared secret from etsy.com/developers/your-apps - letters and digits only.");
    }
    requireEncryption();
    let previous = null;
    try {
      previous = readSecret("keystring");
    } catch {
      previous = null;
    }
    if (previous !== key) clearConnection();
    writeSecret("keystring", key);
    writeSecret("sharedSecret", secret);
  };

  const saveConnection = ({ refreshToken, userId, shopId, shopName }) => {
    requireEncryption();
    writeSecret("refreshToken", refreshToken);
    const at = now().toISOString();
    store.set("refreshSavedAt", at);
    store.set("connectedAt", at);
    store.set("userId", userId ?? null);
    store.set("shopId", shopId ?? null);
    store.set("shopName", shopName ?? null);
  };

  // Etsy may hand out a new refresh token with every refresh; the newest one is the one to keep,
  // and its 90 days start now.
  const saveRefreshToken = (refreshToken) => {
    requireEncryption();
    writeSecret("refreshToken", refreshToken);
    store.set("refreshSavedAt", now().toISOString());
  };

  // Disconnect keeps the key (connect again in one click); remove drops everything.
  const disconnect = () => clearConnection();
  const removeKey = () => {
    clearConnection();
    store.delete("keystring");
    store.delete("sharedSecret");
  };

  return { status, secrets, saveKey, saveConnection, saveRefreshToken, disconnect, removeKey };
};
