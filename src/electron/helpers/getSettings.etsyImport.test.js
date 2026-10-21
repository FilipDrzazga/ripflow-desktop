import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// E3b-2: the two per-machine settings of the Etsy import and the moment the import starts from. electron-store
// is replaced by a Map with the same get / set / delete surface and the `defaults` of the real one.
const data = vi.hoisted(() => new Map());
const defaultsOf = vi.hoisted(() => ({}));
vi.mock("electron-store", () => ({
  default: class FakeStore {
    constructor({ defaults } = {}) {
      Object.assign(defaultsOf, defaults ?? {});
    }
    get(key, fallback) {
      if (data.has(key)) return data.get(key);
      return key in defaultsOf ? defaultsOf[key] : fallback;
    }
    set(key, value) {
      data.set(key, value);
    }
    delete(key) {
      data.delete(key);
    }
  },
}));

import { getSettings, setSettings, getEtsyImportSince } from "./getSettings.js";

const T0 = Date.parse("2026-10-21T12:00:00Z");

beforeEach(() => {
  data.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("etsyImportEnabled / etsyLibraryPath", () => {
  it("default to off and empty (a station is not an importer until someone says so)", () => {
    const s = getSettings();
    expect(s.etsyImportEnabled).toBe(false);
    expect(s.etsyLibraryPath).toBe("");
    expect(getEtsyImportSince()).toBeNull();
  });

  it("switching on stamps the start moment in epoch seconds; saving again while on keeps the first one", () => {
    setSettings({ etsyImportEnabled: true });
    expect(getEtsyImportSince()).toBe(Math.floor(T0 / 1000));
    vi.setSystemTime(T0 + 3600 * 1000);
    setSettings({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY" });
    expect(getEtsyImportSince()).toBe(Math.floor(T0 / 1000));
  });

  it("switching off forgets the moment; switching on again starts afresh", () => {
    setSettings({ etsyImportEnabled: true });
    setSettings({ etsyImportEnabled: false });
    expect(getEtsyImportSince()).toBeNull();
    vi.setSystemTime(T0 + 7200 * 1000);
    setSettings({ etsyImportEnabled: true });
    expect(getEtsyImportSince()).toBe(Math.floor((T0 + 7200 * 1000) / 1000));
  });

  it("only a boolean true switches it on", () => {
    setSettings({ etsyImportEnabled: "true" });
    expect(getSettings().etsyImportEnabled).toBe(false);
    expect(getEtsyImportSince()).toBeNull();
  });

  it("a save that does not send them leaves both as they were (rule 4: unspecified = keep)", () => {
    setSettings({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY" });
    setSettings({ workstationName: "PC-1" });
    expect(getSettings()).toMatchObject({ etsyImportEnabled: true, etsyLibraryPath: "D:\\ETSY", workstationName: "PC-1" });
  });

  it("the library path is stored trimmed", () => {
    setSettings({ etsyLibraryPath: "  D:\\ETSY  " });
    expect(getSettings().etsyLibraryPath).toBe("D:\\ETSY");
  });
});
