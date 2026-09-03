// Which NavBar views a shop profile allows.
//
// This is a deliberate mirror of getFeature in electron/helpers/shopProfile.js:46-49:
// that helper lives in the main process and is NOT exposed over IPC, so the renderer
// cannot call it and has to re-implement the same rule. Both copies must stay
// fail-closed and strict — a flag written as 1 or "true" by a sloppy import is not a
// feature the client bought.

// View id -> the profile feature flag that gates it. Only the views listed here are
// gated; everything else is core and always available.
export const VIEW_FEATURE = {
  customOrder: "customOrders",
  analytics: "analytics",
};

// A profile feature flag asked for by name, with no view mapping in between. Not every
// gated feature owns a NavBar tab: ripErrors is a poll plus badges, a header counter and
// a status pill scattered across several components, so it has to be asked for directly.
// isViewEnabled delegates here, so the two callers can never drift apart on what "off"
// means.
export const isFeatureEnabled = (flag, profile) => {
  // null = the profile could not be read. We know nothing, so we grant nothing.
  if (!profile) return false;
  return profile.features?.[flag] === true;
};

export const isViewEnabled = (viewId, profile) => {
  // hasOwn, not a bare lookup: "constructor" / "toString" would otherwise resolve on
  // the prototype and turn an unknown view id into a gated one.
  const flag = Object.hasOwn(VIEW_FEATURE, viewId) ? VIEW_FEATURE[viewId] : null;
  // Not a gated view (print, batch, production, logs, settings) — or an id we do not
  // know at all. Never hide something we have no rule for.
  if (!flag) return true;
  return isFeatureEnabled(flag, profile);
};
