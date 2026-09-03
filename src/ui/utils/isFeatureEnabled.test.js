import { describe, it, expect } from "vitest";
import { isFeatureEnabled, isViewEnabled, VIEW_FEATURE } from "./featureVisibility";

// A separate file from featureVisibility.test.js on purpose: that one is the 2c contract
// for isViewEnabled and is left byte-for-byte alone, so the new export gets its own
// coverage here rather than an edit there.

// Minimal profile builder — only the block isFeatureEnabled reads.
const withFeatures = (features) => ({ schemaVersion: 1, features });

describe("isFeatureEnabled — sentinel (fail-closed)", () => {
  it("denies the feature when the profile is null", () => {
    // null is the "could not read the database" sentinel, NOT "fresh install".
    expect(isFeatureEnabled("ripErrors", null)).toBe(false);
  });

  it("denies the feature when the profile is undefined", () => {
    expect(isFeatureEnabled("ripErrors", undefined)).toBe(false);
  });

  it("denies the feature on a profile that carries no features block", () => {
    expect(isFeatureEnabled("ripErrors", { schemaVersion: 1 })).toBe(false);
  });

  it("denies a flag absent from an existing features block", () => {
    expect(isFeatureEnabled("ripErrors", withFeatures({ analytics: true }))).toBe(false);
  });

  it("denies the feature when features is not an object", () => {
    expect(isFeatureEnabled("ripErrors", { features: null })).toBe(false);
    expect(isFeatureEnabled("ripErrors", { features: "ripErrors" })).toBe(false);
  });
});

describe("isFeatureEnabled — strict boolean", () => {
  it("grants the feature on a real boolean true", () => {
    expect(isFeatureEnabled("ripErrors", withFeatures({ ripErrors: true }))).toBe(true);
  });

  it("denies the feature on a real boolean false", () => {
    expect(isFeatureEnabled("ripErrors", withFeatures({ ripErrors: false }))).toBe(false);
  });

  // Mirrors getFeature in electron/helpers/shopProfile.js: the profile is a free-form
  // JSON blob, so a sloppy import can write 1 or "true". Truthy is not a bought feature.
  it("denies truthy junk (1, \"true\", \"yes\", {}, [])", () => {
    for (const junk of [1, "true", "yes", {}, []]) {
      expect(isFeatureEnabled("ripErrors", withFeatures({ ripErrors: junk }))).toBe(false);
    }
  });

  it("denies falsy junk (0, \"\", null) without confusing it for an answer", () => {
    for (const junk of [0, "", null]) {
      expect(isFeatureEnabled("ripErrors", withFeatures({ ripErrors: junk }))).toBe(false);
    }
  });
});

describe("isFeatureEnabled — flag isolation", () => {
  // The whole point of 2c-bis: ripErrors is cut on its own, so a profile that grants
  // the neighbouring flags must not drag it along.
  it("does not let a neighbouring flag switch ripErrors on", () => {
    const profile = withFeatures({
      customOrders: true,
      analytics: true,
      labelPrinting: true,
      shopify: true,
      sewing: true,
    });
    expect(isFeatureEnabled("ripErrors", profile)).toBe(false);
    expect(isFeatureEnabled("labelPrinting", profile)).toBe(true);
  });

  it("keeps the other flags off when only ripErrors is granted", () => {
    const profile = withFeatures({ ripErrors: true });
    expect(isFeatureEnabled("ripErrors", profile)).toBe(true);
    for (const other of ["labelPrinting", "shopify", "sewing", "customOrders", "analytics"]) {
      expect(isFeatureEnabled(other, profile)).toBe(false);
    }
  });

  it("does not resolve a flag name on Object.prototype", () => {
    // profile.features?.["toString"] would be a function — truthy, but not === true.
    expect(isFeatureEnabled("toString", withFeatures({}))).toBe(false);
    expect(isFeatureEnabled("constructor", withFeatures({}))).toBe(false);
  });
});

describe("isViewEnabled delegates to isFeatureEnabled", () => {
  // isViewEnabled now routes its verdict through isFeatureEnabled. If someone re-inlines
  // the rule in one of them, these drift apart.
  it("agrees with isFeatureEnabled on every gated view, across profile shapes", () => {
    const profiles = [
      null,
      undefined,
      { schemaVersion: 1 },
      withFeatures({}),
      withFeatures({ customOrders: true, analytics: true }),
      withFeatures({ customOrders: false, analytics: 1 }),
      withFeatures({ customOrders: "true", analytics: true }),
    ];
    for (const [viewId, flag] of Object.entries(VIEW_FEATURE)) {
      for (const profile of profiles) {
        expect(isViewEnabled(viewId, profile)).toBe(isFeatureEnabled(flag, profile));
      }
    }
  });

  it("still allows ungated views that isFeatureEnabled would deny", () => {
    // ripErrors is a feature WITHOUT a view, so it must not appear in VIEW_FEATURE —
    // otherwise the NavBar would start hiding a tab that does not exist.
    expect(Object.hasOwn(VIEW_FEATURE, "ripErrors")).toBe(false);
    expect(isViewEnabled("print", null)).toBe(true);
    expect(isFeatureEnabled("print", null)).toBe(false);
  });
});
