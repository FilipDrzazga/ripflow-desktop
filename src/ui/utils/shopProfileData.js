// Reads plain DATA out of a shop profile in the renderer.
//
// Deliberately NOT part of featureVisibility.js: that file answers "is this feature
// visible to this client", this one answers "what does this client's config contain".
// They diverge as soon as ETAP 2e lands printers here — a printer list is data, not a
// gate, and mixing the two would make one file own both questions.
//
// It is a module of pure functions for one reason: the renderer's profile gates have no
// standing guard (the rendering harness was rejected in 50f64c8), and a pure function is
// the only shape of this cut that can carry a test at all. Same reasoning as
// featureVisibility.js.

// The sewing companies this shop dispatches to, as a clean list of names.
//
// Mirrors getPrinters in electron/helpers/shopProfile.js:30-35, including its shape
// check: the profile is a free-form JSON blob in a single column, so a hand-edited or
// half-imported row can carry anything under this key.
//
// Returns [] and never null. That is the documented exception to the null-sentinel
// discipline used elsewhere for the profile: this is a LIST, so an empty array is a
// legal answer meaning "this shop has no sewing companies", and every caller has to
// handle that case regardless. It is the same call getAllFabrics makes.
//
// Fail-closed on every unknown shape — an unreadable profile (null) yields no companies
// rather than a guessed default, because a wrong sewing company is a parcel sent to the
// wrong address.
export const getSewingCompanies = (profile) => {
  // null / undefined = the profile could not be read. We know nothing, so we offer nothing.
  if (!profile) return [];
  const list = profile.sewingCompanies;
  if (!Array.isArray(list)) return [];
  return list
    .filter((name) => typeof name === "string" && name.trim() !== "")
    .map((name) => name.trim());
};
