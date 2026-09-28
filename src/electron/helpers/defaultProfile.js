// The shop profile of a FRESH install: an empty skeleton to be configured by importing a profile
// file (Settings -> Shop Profile -> Import, ETAP 3). Seeded into shop_profile by initDb only when
// the table is empty, and kept here as the in-memory stand-in when there is no row.
//
// It carries NO shop's data - that is the decision (FILIP 2026-09-21, PRODUCTIZATION ETAP 3 "seed
// vs migration"): until 3-6 this was Alex's setup, and a client without an import would have got
// his scanner rules, hotfolders, printers and Shopify handle as their OWN durable row. Alex's
// profile lives in profiles/fashion-formula-profile.json (his live row, 3-5).
//
// Every reader already copes with this shape, because it is the shape of "nothing configured":
// no printer (getPrinterByCode null -> every batch refused with ERR_INVALID_PRINTER), every feature
// off (getFeature false), no scan rule (a scan only filters), no folder, no sewing company. The UI
// shows a "not configured" banner until a profile with printers is imported.
export const DEFAULT_PROFILE = {
  // The shape of the current schema: a seeded row must not look one migration behind.
  schemaVersion: 3,
  printers: [],
  materialClasses: [],
  productTypes: [],
  // Explicit null: "not configured" - getFolder answers null for it, like for a missing key.
  // "PRINTED" is RipFlow's own folder (inside every stored batch_path, rule 22), not a shop's.
  folders: { printed: "PRINTED", ripError: null, customOrder: null },
  scanRules: [],
  sewingCompanies: [],
  integrations: { shopify: { storeHandle: "" } },
  features: {
    customOrders: false,
    analytics: false,
    ripErrors: false,
    labelPrinting: false,
    shopify: false,
    sewing: false,
  },
};
