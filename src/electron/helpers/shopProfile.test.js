import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the DB edge only — the cache under test is the real one, exactly as
// fabricCache.test.js does it. A mutable behaviour lets one suite exercise all three
// answers db.getShopProfile can give: a row, no row (null), or a throw.
let dbBehaviour = () => null;

vi.mock("./db.js", () => ({
  getShopProfile: () => dbBehaviour(),
}));

import {
  loadShopProfile,
  invalidateShopProfile,
  getProfile,
  getPrinters,
  getPrinterByCode,
  getFeature,
} from "./shopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

const ROW = {
  schemaVersion: 1,
  printers: [
    { code: "AAA", materialClass: "Cottons", hotfolder: "HOT_A" },
    { code: "BBB", materialClass: "Polyesters", hotfolder: "HOT_B" },
  ],
  features: { shopify: false, analytics: true },
};

beforeEach(() => {
  dbBehaviour = () => null;
  invalidateShopProfile();
});

describe("shopProfile — cache not loaded", () => {
  it("getProfile returns null, not a default standing in for one", () => {
    expect(getProfile()).toBeNull();
  });

  it("getPrinters returns an empty array, never null", () => {
    expect(getPrinters()).toEqual([]);
  });

  it("getPrinterByCode returns null", () => {
    expect(getPrinterByCode("DGEN")).toBeNull();
  });

  it("getFeature is fail-closed", () => {
    // No profile means no feature: a dark button is a worse experience, but a live
    // button wired to a config we could not read is a wrong link or a wrong path.
    expect(getFeature("shopify")).toBe(false);
    expect(getFeature("analytics")).toBe(false);
  });
});

describe("shopProfile — no row in the DB (fresh install)", () => {
  beforeEach(() => {
    dbBehaviour = () => null;
    loadShopProfile();
  });

  it("falls back to DEFAULT_PROFILE itself, not a copy", () => {
    expect(getProfile()).toBe(DEFAULT_PROFILE);
  });

  it("serves the default printers", () => {
    expect(getPrinters().map((p) => p.code)).toEqual(["DGEN", "YOKO", "YUMI"]);
  });

  it("serves the default feature flags", () => {
    expect(getFeature("shopify")).toBe(true);
  });
});

describe("shopProfile — a row exists in the DB", () => {
  beforeEach(() => {
    dbBehaviour = () => ROW;
    loadShopProfile();
  });

  it("serves the row, not the default", () => {
    expect(getProfile()).toBe(ROW);
    expect(getProfile()).not.toBe(DEFAULT_PROFILE);
  });

  it("printers come from the row", () => {
    expect(getPrinters().map((p) => p.code)).toEqual(["AAA", "BBB"]);
  });

  it("a false flag in the DB beats a true one in the default", () => {
    // The point of the whole table: the DB configures the app, the code does not.
    expect(DEFAULT_PROFILE.features.shopify).toBe(true);
    expect(getFeature("shopify")).toBe(false);
    expect(getFeature("analytics")).toBe(true);
  });
});

describe("shopProfile — the DB read throws", () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("does not propagate the throw and leaves the null sentinel", () => {
    dbBehaviour = () => {
      throw new Error("corrupt JSON in shop_profile.data");
    };
    expect(() => loadShopProfile()).not.toThrow();
    expect(getProfile()).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("a failed RELOAD drops the previously loaded profile", () => {
    // The difference between "does not crash" and "quietly serves a stale profile".
    dbBehaviour = () => ROW;
    loadShopProfile();
    expect(getProfile()).toBe(ROW);

    dbBehaviour = () => {
      throw new Error("DB unreachable");
    };
    loadShopProfile();
    expect(getProfile()).toBeNull();
  });
});

describe("shopProfile — shape guards", () => {
  it("getFeature requires a real boolean true", () => {
    // A flag written as 1 or "true" by a sloppy import stays off. Fail-closed all
    // the way down, so a half-valid profile cannot switch a feature on by accident.
    dbBehaviour = () => ({ features: { a: 1, b: "true", c: {}, d: true } });
    loadShopProfile();
    expect(getFeature("a")).toBe(false);
    expect(getFeature("b")).toBe(false);
    expect(getFeature("c")).toBe(false);
    expect(getFeature("d")).toBe(true);
  });

  it("getFeature on a profile with no features block returns false", () => {
    dbBehaviour = () => ({ schemaVersion: 1 });
    loadShopProfile();
    expect(getFeature("shopify")).toBe(false);
  });

  it("getPrinters returns [] when the row's printers field is not an array", () => {
    // The profile is a free-form JSON blob in one column: a hand-edited or
    // half-imported row can carry anything, so the shape is checked at the point of use.
    dbBehaviour = () => ({ printers: "DGEN,YOKO" });
    loadShopProfile();
    expect(getPrinters()).toEqual([]);
    expect(getPrinterByCode("DGEN")).toBeNull();
  });
});

describe("shopProfile — getPrinterByCode is case-insensitive ON PURPOSE", () => {
  // DEBT, not a quirk: the lookup is loose while PRINTER.* is compared strictly, so
  // the same code passes here and bounces off a comparison elsewhere. Recorded in
  // PRODUCTIZATION.md under 2e, where the fix is to normalise the code on INPUT
  // (uppercase when pulling it out of a folder name) and tighten this lookup - NOT
  // to loosen more call sites. Until then this test pins the current behaviour, so
  // whoever tightens it at 2e sees a failing test rather than a silent change.
  beforeEach(() => {
    dbBehaviour = () => ROW;
    loadShopProfile();
  });

  it("matches regardless of case", () => {
    expect(getPrinterByCode("aaa")?.code).toBe("AAA");
    expect(getPrinterByCode("AAA")?.code).toBe("AAA");
  });

  it("still returns null for an unknown code", () => {
    expect(getPrinterByCode("NOPE")).toBeNull();
  });

  it("returns null for an empty or missing code", () => {
    expect(getPrinterByCode("")).toBeNull();
    expect(getPrinterByCode(undefined)).toBeNull();
  });
});
