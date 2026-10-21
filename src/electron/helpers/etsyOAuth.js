import crypto from "node:crypto";

// Etsy Open API v3 sign-in (OAuth 2.0 authorization code + PKCE), the parts that need no
// window and no network: the PKCE pair, the connect address and the reading of the address
// Etsy redirects back to. Etsy sends the code to a redirect_uri that MUST start with
// https:// - RipFlow never serves it: the sign-in window (etsyConnectWindow.js) catches the
// request before it leaves the machine. The same address has to be listed under "Callback
// URLs" of the app on etsy.com/developers/your-apps, character for character.
export const ETSY_REDIRECT_URI = "https://localhost/ripflow-etsy-callback";

export const ETSY_CONNECT_URL = "https://www.etsy.com/oauth/connect";
export const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

// transactions_r: receipts (orders) and their items. listings_r: active listings, for the
// listing -> pattern map and the "Etsy check" (plan E4) - asked now so connecting once is enough.
export const ETSY_SCOPES = ["transactions_r", "listings_r"];

const base64Url = (buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// RFC 7636: verifier = 43-128 unreserved characters; challenge = BASE64URL(SHA256(verifier)).
export const challengeOf = (verifier) => base64Url(crypto.createHash("sha256").update(verifier).digest());

export const createPkce = (randomBytes = crypto.randomBytes) => {
  const verifier = base64Url(randomBytes(32));
  return { verifier, challenge: challengeOf(verifier), state: base64Url(randomBytes(16)) };
};

export const buildConnectUrl = ({ keystring, challenge, state, redirectUri = ETSY_REDIRECT_URI, scopes = ETSY_SCOPES }) => {
  const url = new URL(ETSY_CONNECT_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", keystring);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

// Is this request the redirect back to RipFlow? Compared without the query: Etsy appends
// code / state / error to the registered address.
export const isRedirect = (address, redirectUri = ETSY_REDIRECT_URI) => {
  try {
    const url = new URL(address);
    const expected = new URL(redirectUri);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  } catch {
    return false;
  }
};

// The redirect -> { code } | { error, description }. A state that is not the one this sign-in
// sent is refused: the code would belong to a request RipFlow did not start.
export const parseRedirect = (address, expectedState) => {
  let url;
  try {
    url = new URL(address);
  } catch {
    return { error: "invalid_redirect", description: "Etsy redirected to an address RipFlow could not read." };
  }
  const params = url.searchParams;
  if (params.get("state") !== expectedState) {
    return { error: "state_mismatch", description: "The answer from Etsy does not belong to this sign-in. Try Connect again." };
  }
  if (params.get("error")) {
    return { error: params.get("error"), description: params.get("error_description") || "Etsy refused the sign-in." };
  }
  const code = params.get("code");
  if (!code) return { error: "missing_code", description: "Etsy sent no authorization code." };
  return { code };
};

// Body of the token request. Two grants: the first sign-in (code + verifier) and the hourly
// refresh (the 90-day refresh token).
export const tokenRequestBody = (grant) => {
  const body = new URLSearchParams();
  if (grant.refreshToken) {
    body.set("grant_type", "refresh_token");
    body.set("client_id", grant.keystring);
    body.set("refresh_token", grant.refreshToken);
  } else {
    body.set("grant_type", "authorization_code");
    body.set("client_id", grant.keystring);
    body.set("redirect_uri", grant.redirectUri ?? ETSY_REDIRECT_URI);
    body.set("code", grant.code);
    body.set("code_verifier", grant.verifier);
  }
  return body.toString();
};

// The access token is "<user id>.<token>"; the prefix is the Etsy user who signed in.
export const userIdOfToken = (token) => {
  const match = /^(\d+)\./.exec(String(token ?? ""));
  return match ? Number(match[1]) : null;
};
