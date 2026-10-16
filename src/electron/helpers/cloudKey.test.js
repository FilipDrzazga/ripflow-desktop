import { describe, it, expect, vi, beforeEach } from "vitest";

// electron-store and electron's safeStorage are replaced: the store is a Map, "encryption" is a
// reversible marker so a test can tell the stored value is NOT the key itself.
const state = vi.hoisted(() => ({ data: new Map(), encryptionAvailable: true, decryptThrows: false }));

vi.mock("electron-store", () => ({
  default: class {
    get(key) {
      return state.data.get(key);
    }
    set(key, value) {
      state.data.set(key, value);
    }
    delete(key) {
      state.data.delete(key);
    }
  },
}));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: (text) => Buffer.from(`enc:${[...text].reverse().join("")}`),
    decryptString: (buffer) => {
      if (state.decryptThrows) throw new Error("cannot decrypt");
      return [...buffer.toString().slice(4)].reverse().join("");
    },
  },
}));

import { hasCloudKey, getCloudKey, setCloudKey, clearCloudKey } from "./cloudKey.js";

const KEY = "abcd1234-efgh5678";

beforeEach(() => {
  state.data.clear();
  state.encryptionAvailable = true;
  state.decryptThrows = false;
});

describe("cloudKey", () => {
  it("stores the key encrypted - the value at rest is not the key - and reads it back", () => {
    setCloudKey(KEY);
    expect(hasCloudKey()).toBe(true);
    const stored = [...state.data.values()][0];
    expect(stored).not.toContain(KEY);
    expect(Buffer.from(stored, "base64").toString()).not.toContain(KEY);
    expect(getCloudKey()).toBe(KEY);
  });

  it("trims what was typed", () => {
    setCloudKey(`  ${KEY}\n`);
    expect(getCloudKey()).toBe(KEY);
  });

  it("refuses to save a key in plain text when this PC cannot encrypt", () => {
    state.encryptionAvailable = false;
    expect(() => setCloudKey(KEY)).toThrowError(expect.objectContaining({ code: "CLOUD_KEY_NOT_ENCRYPTABLE" }));
    expect(hasCloudKey()).toBe(false);
    expect(state.data.size).toBe(0);
  });

  it.each([["empty", ""], ["blank", "   "], ["too short", "abc"], ["with spaces inside", "abcd 1234 efgh"], ["not a string", null]])(
    "refuses a key that is %s",
    (_name, value) => {
      expect(() => setCloudKey(value)).toThrowError(expect.objectContaining({ code: "CLOUD_KEY_INVALID" }));
      expect(state.data.size).toBe(0);
    },
  );

  it("a stored key this Windows user cannot decrypt reads as no key", () => {
    setCloudKey(KEY);
    state.decryptThrows = true;
    expect(getCloudKey()).toBeNull();
  });

  it("clear removes it", () => {
    setCloudKey(KEY);
    clearCloudKey();
    expect(hasCloudKey()).toBe(false);
    expect(getCloudKey()).toBeNull();
  });
});
