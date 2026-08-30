import { describe, it, expect } from "vitest";
import { isViewEnabled, VIEW_FEATURE } from "./featureVisibility";

// Minimal profile builder — only the block isViewEnabled reads.
const withFeatures = (features) => ({ schemaVersion: 1, features });

describe("isViewEnabled — sentinel (fail-closed)", () => {
  it("hides every gated view when the profile is null", () => {
    expect(isViewEnabled("customOrder", null)).toBe(false);
    expect(isViewEnabled("analytics", null)).toBe(false);
  });

  it("hides every gated view when the profile is undefined", () => {
    expect(isViewEnabled("customOrder", undefined)).toBe(false);
    expect(isViewEnabled("analytics", undefined)).toBe(false);
  });

  it("hides gated views on a profile that carries no features block", () => {
    expect(isViewEnabled("customOrder", { schemaVersion: 1 })).toBe(false);
    expect(isViewEnabled("analytics", { schemaVersion: 1 })).toBe(false);
  });

  it("hides a gated view whose flag is absent from an existing features block", () => {
    expect(isViewEnabled("customOrder", withFeatures({ analytics: true }))).toBe(false);
  });
});

describe("isViewEnabled — strict boolean", () => {
  it("shows the view on a real boolean true", () => {
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: true }))).toBe(true);
    expect(isViewEnabled("analytics", withFeatures({ analytics: true }))).toBe(true);
  });

  it("hides the view on a real boolean false", () => {
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: false }))).toBe(false);
    expect(isViewEnabled("analytics", withFeatures({ analytics: false }))).toBe(false);
  });

  // The mirrored rule from shopProfile.js:46-49 — the profile is a free-form JSON blob,
  // so a sloppy import can write 1 or "true". Truthy is not a bought feature.
  it("hides the view when the flag is the number 1", () => {
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: 1 }))).toBe(false);
    expect(isViewEnabled("analytics", withFeatures({ analytics: 1 }))).toBe(false);
  });

  it('hides the view when the flag is the string "true"', () => {
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: "true" }))).toBe(false);
    expect(isViewEnabled("analytics", withFeatures({ analytics: "true" }))).toBe(false);
  });

  it('hides the view on other truthy junk ("yes", {})', () => {
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: "yes" }))).toBe(false);
    expect(isViewEnabled("customOrder", withFeatures({ customOrders: {} }))).toBe(false);
  });
});

describe("isViewEnabled — ungated views", () => {
  it("always allows the core views, even with a null profile", () => {
    for (const id of ["print", "batch", "production", "logs", "settings"]) {
      expect(isViewEnabled(id, null)).toBe(true);
      expect(isViewEnabled(id, withFeatures({}))).toBe(true);
    }
  });

  it("allows a view id we have no rule for", () => {
    expect(isViewEnabled("somethingNew", null)).toBe(true);
    expect(isViewEnabled("somethingNew", withFeatures({ customOrders: true }))).toBe(true);
  });

  it("does not let a prototype key masquerade as a gated view", () => {
    // A bare VIEW_FEATURE[viewId] lookup resolves these on Object.prototype and would
    // turn an unknown id into a gated one.
    expect(isViewEnabled("constructor", null)).toBe(true);
    expect(isViewEnabled("toString", null)).toBe(true);
  });
});

describe("VIEW_FEATURE map", () => {
  it("gates exactly the two views 2c covers", () => {
    expect(VIEW_FEATURE).toEqual({ customOrder: "customOrders", analytics: "analytics" });
  });
});
