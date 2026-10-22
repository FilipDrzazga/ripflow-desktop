import { describe, it, expect } from "vitest";
import {
  challengeOf,
  createPkce,
  buildConnectUrl,
  isRedirect,
  parseRedirect,
  tokenRequestBody,
  userIdOfToken,
  ETSY_REDIRECT_URI,
  ETSY_SCOPES,
} from "./etsyOAuth.js";

describe("etsyOAuth - PKCE", () => {
  it("challenge = BASE64URL(SHA256(verifier)) - the RFC 7636 appendix B vector", () => {
    expect(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("a fresh pair: 43-character url-safe verifier, its own challenge, a state", () => {
    const pkce = createPkce();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pkce.challenge).toBe(challengeOf(pkce.verifier));
    expect(pkce.state).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(createPkce().verifier).not.toBe(pkce.verifier);
  });
});

describe("etsyOAuth - connect address", () => {
  it("carries every parameter Etsy requires, scopes space-separated", () => {
    const url = new URL(buildConnectUrl({ keystring: "abc123", challenge: "CH", state: "ST" }));
    expect(url.origin + url.pathname).toBe("https://www.etsy.com/oauth/connect");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "abc123",
      redirect_uri: ETSY_REDIRECT_URI,
      scope: "transactions_r listings_r shops_r",
      state: "ST",
      code_challenge: "CH",
      code_challenge_method: "S256",
    });
    expect(ETSY_SCOPES).toContain("transactions_r");
  });

  it("the redirect address is https (Etsy refuses anything else)", () => {
    expect(ETSY_REDIRECT_URI.startsWith("https://")).toBe(true);
  });
});

describe("etsyOAuth - the redirect back", () => {
  it("recognises the registered address with any query, nothing else", () => {
    expect(isRedirect(`${ETSY_REDIRECT_URI}?code=x&state=y`)).toBe(true);
    expect(isRedirect(`${ETSY_REDIRECT_URI}/more?code=x`)).toBe(false);
    expect(isRedirect("https://localhost/other?code=x")).toBe(false);
    expect(isRedirect("https://www.etsy.com/oauth/connect")).toBe(false);
    expect(isRedirect("not a url")).toBe(false);
  });

  it("a matching state gives the code", () => {
    expect(parseRedirect(`${ETSY_REDIRECT_URI}?code=THE_CODE&state=ST`, "ST")).toEqual({ code: "THE_CODE" });
  });

  it("a foreign or missing state is refused, even with a code", () => {
    expect(parseRedirect(`${ETSY_REDIRECT_URI}?code=THE_CODE&state=OTHER`, "ST").error).toBe("state_mismatch");
    expect(parseRedirect(`${ETSY_REDIRECT_URI}?code=THE_CODE`, "ST").error).toBe("state_mismatch");
  });

  it("Etsy's error comes through with its description", () => {
    expect(parseRedirect(`${ETSY_REDIRECT_URI}?error=access_denied&error_description=The+user+denied+access&state=ST`, "ST")).toEqual({
      error: "access_denied",
      description: "The user denied access",
    });
  });

  it("no code and no error = missing_code", () => {
    expect(parseRedirect(`${ETSY_REDIRECT_URI}?state=ST`, "ST").error).toBe("missing_code");
  });
});

describe("etsyOAuth - token request", () => {
  it("first sign-in: authorization_code with the verifier and the same redirect_uri", () => {
    const body = Object.fromEntries(new URLSearchParams(tokenRequestBody({ keystring: "K", code: "C", verifier: "V" })));
    expect(body).toEqual({ grant_type: "authorization_code", client_id: "K", redirect_uri: ETSY_REDIRECT_URI, code: "C", code_verifier: "V" });
  });

  it("refresh: refresh_token grant, no code", () => {
    const body = Object.fromEntries(new URLSearchParams(tokenRequestBody({ keystring: "K", refreshToken: "1.R" })));
    expect(body).toEqual({ grant_type: "refresh_token", client_id: "K", refresh_token: "1.R" });
  });

  it("the user id is the numeric prefix of the token", () => {
    expect(userIdOfToken("12345678.abc")).toBe(12345678);
    expect(userIdOfToken("abc")).toBe(null);
    expect(userIdOfToken(undefined)).toBe(null);
  });
});
