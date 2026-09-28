import { describe, it, expect } from "vitest";
import {
  importConfirmMessage,
  importResultNotice,
  importErrorsNotice,
  exportResultNotice,
} from "./shopProfileView.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

// ETAP 3-4: what Settings -> Shop Profile says. The view only wires these to the store, the
// services and notify, so the wording and the Warning / Error split are pinned here.

const PROFILE = {
  schemaVersion: 3,
  printers: [{ code: "DGEN", materialClass: "Cottons", hotfolder: "HOT_C" }],
  materialClasses: [{ name: "Cottons", margin: 10, defaultRollWidth: 1420 }],
  productTypes: [{ code: "FQ", width: 670, height: 480 }],
  folders: { ripError: "ERR" },
  scanRules: [
    { role: "press", from: "printed", to: "heatpress" },
    { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
  ],
  sewingCompanies: ["Stitch Co"],
  integrations: { shopify: { storeHandle: "" } },
  features: { analytics: true, sewing: true, shopify: "true" },
};

const PREVIEW = {
  success: true,
  valid: true,
  token: "t",
  fileName: "client-two.json",
  stationStale: false,
  diff: {
    changedSections: ["printers", "sewingCompanies", "features"],
    printersAdded: ["MIMAKI"],
    printersRemoved: ["YOKO"],
    sewingCompaniesAdded: [],
    sewingCompaniesRemoved: ["Olya"],
    featuresTurnedOn: ["ripErrors"],
    featuresTurnedOff: ["analytics"],
    scanRolesRemoved: ["rollpress"],
  },
  impact: { stageRowsCounted: 680, byRemovedPrinter: { YOKO: 141 }, atSewingByRemovedCompany: { Olya: 2 } },
};

describe("importConfirmMessage", () => {
  it("names the file, the changes and what they do to existing data", () => {
    const msg = importConfirmMessage(PREVIEW);
    expect(msg).toContain('from "client-two.json"');
    expect(msg).toContain("Changed: printers, sewingCompanies, features");
    expect(msg).toContain("Printers added: MIMAKI");
    expect(msg).toContain("Printer removed: YOKO - 141 production record(s)");
    expect(msg).toContain("Sewing company removed: Olya - 2 file(s) are there now");
    expect(msg).toContain("Turned on: RIP errors");
    expect(msg).toContain("Turned off: Analytics");
    expect(msg).toContain("Scanner rules removed for: rollpress");
    expect(msg).toContain("(counted over 680 production records)");
    expect(msg).toContain("Other stations keep the old profile until they are restarted.");
    expect(msg).not.toContain("WARNING");
  });

});

describe("importResultNotice", () => {
  it("success says to restart the other stations", () => {
    expect(importResultNotice({ success: true, backup: { success: true } })).toEqual({
      type: "Success",
      title: "Shop profile imported",
      message: "Restart the other stations so they use it.",
    });
  });

  it("success with a failed backup is a Warning that says so", () => {
    const n = importResultNotice({ success: true, backup: { success: false, error: "SMB gone" } });
    expect(n.type).toBe("Warning");
    expect(n.message).toContain("The database backup failed (SMB gone)");
  });

  it("PROFILE_CHANGED is a Warning that asks for a new preview, not an Error", () => {
    const n = importResultNotice({ success: false, code: PROFILE_CHANGED, error: "Changed elsewhere." });
    expect(n).toEqual({
      type: "Warning",
      title: "Profile changed elsewhere",
      message: "Changed elsewhere. This station now shows the current profile - choose the file again to import.",
    });
  });

  it("any other failure is an Error", () => {
    expect(importResultNotice({ success: false, error: "disk full" })).toEqual({
      type: "Error",
      title: "Import failed",
      message: "disk full",
    });
  });
});

describe("importErrorsNotice / exportResultNotice", () => {
  it("the notice carries the first errors and says how many more are listed", () => {
    const n = importErrorsNotice(["a.", "b.", "c.", "d.", "e."]);
    expect(n).toEqual({ type: "Error", title: "The profile file was not imported", message: "a. b. c. (and 2 more below)" });
    expect(importErrorsNotice(["a."]).message).toBe("a.");
  });

  it("export: path on success, a Warning when the file would not import back, an Error on failure", () => {
    expect(exportResultNotice({ success: true, path: "C:/p.json", warnings: [] })).toEqual({
      type: "Success",
      title: "Shop profile exported",
      message: "C:/p.json",
    });
    expect(exportResultNotice({ success: true, path: "C:/p.json", warnings: ["x."] }).type).toBe("Warning");
    expect(exportResultNotice({ success: false, error: "no row" })).toEqual({
      type: "Error",
      title: "Export failed",
      message: "no row",
    });
  });
});
