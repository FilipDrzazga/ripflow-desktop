// The shop profile a pre-profile install migrates to: Fashion Formula's setup, read out
// of the constants that were hardcoded across the code base (printers, hotfolders,
// margins, roles, sewing companies, Shopify handle). Seeded into shop_profile on first
// run and kept here as the in-memory fallback when the row cannot be read.
export const DEFAULT_PROFILE = {
  schemaVersion: 1,
  printers: [
    {
      code: "DGEN",
      materialClass: "Cottons",
      hotfolder: "AUTOMATION_WORKFLOW_COTTON",
      color: { bg: "#E6F1FB", text: "#0C447C" },
    },
    {
      code: "YOKO",
      materialClass: "Polyesters",
      hotfolder: "AUTOMATION_WORKFLOW_POLY",
      color: { bg: "#EEEDFE", text: "#3C3489" },
    },
    {
      code: "YUMI",
      materialClass: "Polyesters",
      hotfolder: "AUTOMATION_WORKFLOW_POLY",
      color: { bg: "#E1F5EE", text: "#085041" },
    },
  ],
  materialClasses: [
    { name: "Cottons", margin: 10, defaultXmlWidth: 1420, defaultRollWidth: 1420 },
    { name: "Polyesters", margin: 5, defaultXmlWidth: 1420, defaultRollWidth: 1550 },
  ],
  productTypes: [
    { code: "SAMPLE", width: 220, height: 200 },
    { code: "FQ", width: 670, height: 480 },
    { code: "TEA_TOWEL", width: 700, height: 500 },
  ],
  folders: {
    printed: "PRINTED",
    ripError: "AUTOMATION_WORKFLOW_ERROR",
    customOrder: "AUTOMATION_WORKFLOW_MINERVA",
  },
  // What a barcode scan does at a station, keyed by the station's workstationRole
  // (which stays per-machine in electron-store — the profile carries the RULES, not the
  // identity of the station). A role with no entry here scans without moving anything,
  // which is exactly what role "" has always done, so "" deliberately has no row.
  //
  // Alex's four stations, as they behaved before this was configurable. Both heat-press
  // roles share one rule because the cotton and polyester branches were byte-identical.
  //
  // notifyWhenEmpty is FROZEN DEBT, not a feature: it exists only so the QC station keeps
  // its present silence when a scanned batch holds nothing at `from`. The other three warn.
  // Nobody would choose false here on merit; it is written down so the behaviour is visible
  // instead of hidden in a branch.
  scanRules: [
    { role: "cotton", from: "printed", to: "heatpress", notifyWhenEmpty: true },
    { role: "polyester", from: "printed", to: "heatpress", notifyWhenEmpty: true },
    { role: "rollpress", from: "heatpress", to: "qc", notifyWhenEmpty: true },
    { role: "qc", from: "heatpress", to: "qc", notifyWhenEmpty: false },
  ],
  sewingCompanies: ["Olya", "Vagabond"],
  integrations: { shopify: { storeHandle: "fashionformulauk" } },
  features: {
    customOrders: true,
    analytics: true,
    ripErrors: true,
    labelPrinting: true,
    shopify: true,
    sewing: true,
  },
};
