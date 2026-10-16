import Store from "electron-store";
import { safeStorage } from "electron";
import { CloudError } from "./cloudMetres.js";

// The PrintFactory Cloud key (MisKey) belongs to a USER and opens that user's whole Cloud, so it
// is not stored like the other settings: a file of its own (cloud.json, never part of
// getSettings(), so the renderer cannot read it back and settings:set cannot overwrite it) and
// encrypted with the OS (Electron safeStorage = Windows DPAPI: readable only by this Windows
// user on this PC). The renderer only ever learns whether a key is set.
// Per station on purpose: shared config would put the secret into ripflow.db on the share.

const store = new Store({ name: "cloud" });
const STORE_KEY = "misKeyEncrypted";

// MisKey is a token: no spaces or control characters, and a sane length.
const isPlausibleKey = (value) => typeof value === "string" && /^[\x21-\x7e]{8,256}$/.test(value);

export const hasCloudKey = () => typeof store.get(STORE_KEY) === "string" && store.get(STORE_KEY) !== "";

// Main process only. null = no key, or one this Windows user cannot decrypt (a profile copied
// to another account): treated as no key, the operator enters it again.
export const getCloudKey = () => {
  const stored = store.get(STORE_KEY);
  if (typeof stored !== "string" || stored === "") return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch {
    return null;
  }
};

export const setCloudKey = (rawKey) => {
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!isPlausibleKey(key)) {
    throw new CloudError("CLOUD_KEY_INVALID", "That does not look like a PrintFactory Cloud key (8-256 characters, no spaces).");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // Storing it in plain text would be the quiet alternative; refuse instead.
    throw new CloudError("CLOUD_KEY_NOT_ENCRYPTABLE", "This PC cannot encrypt the key (Windows data protection is unavailable), so it was not saved.");
  }
  store.set(STORE_KEY, safeStorage.encryptString(key).toString("base64"));
};

export const clearCloudKey = () => store.delete(STORE_KEY);
