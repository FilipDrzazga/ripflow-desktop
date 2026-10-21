import { describe, it, expect } from "vitest";
import { createEtsyCredentials, REFRESH_TOKEN_LIFETIME_DAYS } from "./etsyCredentials.js";

// A store over a Map and a reversible fake cipher: what lands in the store must never be the
// clear text, and a value "from another Windows user" (no ENC: prefix) must not decrypt.
const makeParts = ({ encryption = true } = {}) => {
  const data = new Map();
  const store = { get: (k) => data.get(k), set: (k, v) => data.set(k, v), delete: (k) => data.delete(k) };
  const crypt = {
    available: () => encryption,
    encrypt: (text) => `ENC:${Buffer.from(text).toString("base64")}`,
    decrypt: (stored) => {
      if (!stored.startsWith("ENC:")) throw new Error("cannot decrypt");
      return Buffer.from(stored.slice(4), "base64").toString();
    },
  };
  return { data, store, crypt };
};

const NOW = new Date("2026-10-21T12:00:00.000Z");

const connected = () => {
  const parts = makeParts();
  const creds = createEtsyCredentials({ ...parts, now: () => NOW });
  creds.saveKey({ keystring: "abcd1234wxyz", sharedSecret: "s3cr3t" });
  creds.saveConnection({ refreshToken: "42.REFRESH", userId: 42, shopId: 777, shopName: "FashionFormula" });
  return { ...parts, creds };
};

describe("etsyCredentials", () => {
  it("writes every secret encrypted - no clear text in the store", () => {
    const { data, creds } = connected();
    const dump = JSON.stringify([...data.values()]);
    for (const secret of ["abcd1234wxyz", "s3cr3t", "42.REFRESH"]) expect(dump).not.toContain(secret);
    expect(creds.secrets()).toEqual({ keystring: "abcd1234wxyz", sharedSecret: "s3cr3t", refreshToken: "42.REFRESH" });
  });

  it("no encryption on this Windows account = nothing written at all", () => {
    const parts = makeParts({ encryption: false });
    const creds = createEtsyCredentials(parts);
    expect(() => creds.saveKey({ keystring: "abc", sharedSecret: "def" })).toThrow(expect.objectContaining({ code: "ETSY_ENCRYPTION_UNAVAILABLE" }));
    expect(parts.data.size).toBe(0);
    expect(creds.status()).toMatchObject({ encryption: false, hasKey: false, connected: false });
  });

  it("refuses a pasted line instead of a key", () => {
    const { store, crypt, data } = makeParts();
    const creds = createEtsyCredentials({ store, crypt });
    for (const bad of [
      { keystring: "", sharedSecret: "x" },
      { keystring: "abc def", sharedSecret: "x" },
      { keystring: "abc", sharedSecret: "x:y" },
      { keystring: "abc" },
    ]) {
      expect(() => creds.saveKey(bad)).toThrow(expect.objectContaining({ code: "ETSY_KEY_INVALID" }));
    }
    expect(data.size).toBe(0);
  });

  it("status shows the shop and a key hint, never a secret", () => {
    const { creds } = connected();
    const status = creds.status();
    expect(status).toEqual({
      encryption: true,
      readable: true,
      hasKey: true,
      keyHint: "...wxyz",
      connected: true,
      userId: 42,
      shopId: 777,
      shopName: "FashionFormula",
      connectedAt: NOW.toISOString(),
      refreshExpiresAt: new Date(NOW.getTime() + REFRESH_TOKEN_LIFETIME_DAYS * 86400000).toISOString(),
    });
    const text = JSON.stringify(status);
    for (const secret of ["abcd1234wxyz", "s3cr3t", "42.REFRESH"]) expect(text).not.toContain(secret);
  });

  it("a NEW key ends the sign-in; the same key saved again keeps it", () => {
    const { creds } = connected();
    creds.saveKey({ keystring: "abcd1234wxyz", sharedSecret: "s3cr3t" });
    expect(creds.status().connected).toBe(true);
    creds.saveKey({ keystring: "other999", sharedSecret: "s3cr3t" });
    expect(creds.status()).toMatchObject({ hasKey: true, connected: false, shopId: null });
    expect(creds.secrets().refreshToken).toBe(null);
  });

  it("disconnect keeps the key, removeKey drops everything", () => {
    const { creds, data } = connected();
    creds.disconnect();
    expect(creds.status()).toMatchObject({ hasKey: true, connected: false });
    creds.removeKey();
    expect(creds.status()).toMatchObject({ hasKey: false, connected: false });
    expect(data.size).toBe(0);
  });

  it("a rotated refresh token replaces the old one and restarts the 90 days", () => {
    const later = new Date("2026-11-01T00:00:00.000Z");
    const parts = makeParts();
    const c = createEtsyCredentials({ ...parts, now: () => later });
    c.saveKey({ keystring: "k1", sharedSecret: "s1" });
    c.saveConnection({ refreshToken: "1.A", userId: 1, shopId: 2, shopName: null });
    c.saveRefreshToken("1.B");
    expect(c.secrets().refreshToken).toBe("1.B");
    expect(c.status().refreshExpiresAt).toBe(new Date(later.getTime() + 90 * 86400000).toISOString());
  });

  it("a value this Windows user cannot decrypt: status says so, secrets refuses", () => {
    const { creds, data } = connected();
    data.set("sharedSecret", "copied-from-another-pc");
    expect(creds.status()).toMatchObject({ readable: false, hasKey: false, connected: false });
    expect(() => creds.secrets()).toThrow(expect.objectContaining({ code: "ETSY_KEY_UNREADABLE" }));
  });
});
