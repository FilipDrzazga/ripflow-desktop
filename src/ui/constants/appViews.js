// The ids of the top-level views App.jsx switches on (`activeView`). Single source of truth: App.jsx, the
// NavBar and the target of an order-search jump (utils/searchTarget.js) read these, so renaming a view
// cannot leave one of them pointing at an id nothing renders.
//
// Not to be confused with VIEW_MODE (constants/viewModes.js), the lenses INSIDE the Production view.
export const APP_VIEW = {
  PRINT: "print",
  BATCH: "batch",
  PRODUCTION: "production",
  CUSTOM_ORDER: "customOrder",
  ANALYTICS: "analytics",
  LOGS: "logs",
  SETTINGS: "settings",
};
