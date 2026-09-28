import { describe, it, expect } from "vitest";
import { profileOverview, profileStatusBadge } from "./shopProfileView.js";
import { PROFILE_STATUS } from "./profileStatus.js";
import { STAGE_COLOR } from "../../shared/constants.js";

// ETAP 4 (4-ui-profile): the cards of Settings -> Shop Profile. The view only lays these out, so
// what each card shows - and what it shows for a malformed row - is pinned here.

const PROFILE = {
  schemaVersion: 3,
  printers: [
    { code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C", color: { bg: "#E6F1FB", text: "#0C447C" } },
    { code: "YOKO", materialClass: "Polyesters", hotfolder: "HOT_P", color: { bg: "blue", text: "#3C3489" } },
  ],
  materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }],
  productTypes: [{ code: "FQ", width: 670, height: 480 }],
  folders: { ripError: "ERR", customOrder: null, somethingNew: "X" },
  scanRules: [
    { role: "press", from: "printed", to: "heatpress" },
    { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
    { role: "odd", from: "nowhere", to: "packed" },
  ],
  sewingCompanies: ["Stitch Co"],
  integrations: { shopify: { storeHandle: "" } },
  features: { analytics: true, sewing: true, shopify: "true" },
};

describe("profileOverview", () => {
  it("no profile -> null (never a guessed one)", () => {
    expect(profileOverview(null)).toBeNull();
    expect(profileOverview(undefined)).toBeNull();
  });

  it("printers: code, class, hotfolder and the colours only when both are hex", () => {
    const { printers } = profileOverview(PROFILE);
    expect(printers[0]).toEqual({ code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C", color: { bg: "#E6F1FB", color: "#0C447C" } });
    expect(printers[1].color).toBeNull(); // "blue" is not hex - the view's grey fallback
  });

  it("a malformed printer row is still shown, with dashes", () => {
    const { printers } = profileOverview({ ...PROFILE, printers: [{ code: "" }, null] });
    expect(printers).toEqual([
      { code: "-", materialClass: "-", hotfolder: "-", color: null },
      { code: "-", materialClass: "-", hotfolder: "-", color: null },
    ]);
  });

  it("classes and product types as table rows", () => {
    const o = profileOverview(PROFILE);
    expect(o.materialClasses).toEqual([{ name: "Cottons", margin: "10", defaultRollWidth: "1420" }]);
    expect(o.productTypes).toEqual([{ code: "FQ", width: "670", height: "480" }]);
  });

  it("folders: a known key gets its label, an empty value is null (not set), an unknown key shows as stored", () => {
    expect(profileOverview(PROFILE).folders).toEqual([
      { key: "ripError", label: "RIP errors", value: "ERR" },
      { key: "customOrder", label: "Custom orders", value: null },
      { key: "somethingNew", label: "somethingNew", value: "X" },
    ]);
  });

  it("scanner rules: stages as chips in the stage colours, silent when notifyWhenEmpty is false", () => {
    const [press, qc, odd] = profileOverview(PROFILE).scanRules;
    expect(press).toEqual({
      role: "press",
      from: { stage: "printed", label: "Printed", color: STAGE_COLOR.printed },
      to: { stage: "heatpress", label: "Heat Press", color: STAGE_COLOR.heatpress },
      silent: false,
    });
    expect(qc.silent).toBe(true);
    expect(odd.from).toEqual({ stage: "nowhere", label: "nowhere", color: null }); // unknown stage: as stored, grey
  });

  it("features: all six, on only for a real true", () => {
    const f = Object.fromEntries(profileOverview(PROFILE).features.map((x) => [x.flag, x.on]));
    expect(f).toEqual({ customOrders: false, analytics: true, ripErrors: false, labelPrinting: false, shopify: false, sewing: true });
  });

  it("sewing companies and the Shopify handle (empty = null)", () => {
    const o = profileOverview(PROFILE);
    expect(o.sewingCompanies).toEqual(["Stitch Co"]);
    expect(o.storeHandle).toBeNull();
    expect(profileOverview({ ...PROFILE, integrations: { shopify: { storeHandle: "shop-x" } } }).storeHandle).toBe("shop-x");
  });
});

describe("profileStatusBadge", () => {
  it("failed -> Unreadable, whatever the profile", () => {
    expect(profileStatusBadge(PROFILE_STATUS.FAILED, null)).toEqual({ tone: "error", label: "Unreadable" });
  });

  it("loading, or loaded without a profile -> Loading", () => {
    expect(profileStatusBadge(PROFILE_STATUS.LOADING, null).label).toBe("Loading");
    expect(profileStatusBadge(PROFILE_STATUS.LOADED, null).label).toBe("Loading");
  });

  it("loaded with no usable printer -> Not configured (the fresh-install skeleton)", () => {
    expect(profileStatusBadge(PROFILE_STATUS.LOADED, { ...PROFILE, printers: [] })).toEqual({ tone: "warning", label: "Not configured" });
  });

  it("loaded with a printer -> Configured", () => {
    expect(profileStatusBadge(PROFILE_STATUS.LOADED, PROFILE)).toEqual({ tone: "ok", label: "Configured" });
  });
});
