// The estimator's config, built from ONE source for the class numbers: the shop profile's
// materialClasses[] - their owner since profile v3 (ETAP 2g-3a/b, FILIP 2026-09-25, variant A).
// Used by the main process (fabricCache.getEstimateConfig) and the renderer (store.fabricConfig),
// so the two can never read the numbers from different places again (BUG 4, rule 23).
//
// estimatePrintLength reads four keys whose names carry the class: marginCotton, marginPoly,
// defaultRollWidthCotton, defaultRollWidthPoly. They are filled from the Cottons / Polyesters
// entries; a key with no valid number is simply absent, so the estimator falls back to the
// class constant of printWidths.js for THAT key (its `?? MARGIN_*` / `?? LM_ROLL_*`).
// Pure, zero imports: carries a test without Electron, the DB or the store.

const CLASS_KEYS = {
  Cottons: { margin: "marginCotton", defaultRollWidth: "defaultRollWidthCotton" },
  Polyesters: { margin: "marginPoly", defaultRollWidth: "defaultRollWidthPoly" },
};

// The four keys, in editor order: marginCotton, defaultRollWidthCotton, marginPoly, defaultRollWidthPoly.
export const CLASS_NUMBER_KEYS = Object.values(CLASS_KEYS).flatMap((keys) => Object.values(keys));

// profile -> { marginCotton?, marginPoly?, defaultRollWidthCotton?, defaultRollWidthPoly? }.
// No profile, or no materialClasses -> {} : every number from the class constants - the same
// numbers the seed carries, so an unreadable profile changes no estimate (the plan's condition).
export const classGlobalsFromProfile = (profile) => {
  const out = {};
  if (!profile || !Array.isArray(profile.materialClasses)) return out;
  for (const cls of profile.materialClasses) {
    const keys = cls && CLASS_KEYS[cls.name];
    if (!keys) continue;
    for (const [field, key] of Object.entries(keys)) {
      const value = cls[field];
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
  }
  return out;
};

// The inverse of classGlobalsFromProfile, for the Settings editor (ETAP 2g-3c): a NEW profile in
// which the Cottons / Polyesters entries carry the numbers from `globals` (the same four keys).
// Everything else - other classes, other fields, other profile sections - is copied untouched;
// the input is never mutated. A class the profile does not list is NOT added (the class list is
// the profile's own decision, 2g-4): it is reported in `missing` and the caller refuses to save.
export const withClassNumbers = (profile, globals) => {
  const classes = Array.isArray(profile?.materialClasses) ? profile.materialClasses : [];
  const missing = Object.keys(CLASS_KEYS).filter((name) => !classes.some((cls) => cls?.name === name));
  const materialClasses = classes.map((cls) => {
    const keys = cls && CLASS_KEYS[cls.name];
    if (!keys) return cls;
    const next = { ...cls };
    for (const [field, key] of Object.entries(keys)) next[field] = globals[key];
    return next;
  });
  return { profile: { ...profile, materialClasses }, missing };
};

// The estimator config, or null. `fabrics` is the catalogue: null = not loaded, and then the
// answer is null - NEVER { fabrics: [] } (rule 23: an empty array is truthy and would drag the
// estimator into its catalogue branch with an empty catalogue). A loaded catalogue, even an
// empty one, gives { globals, fabrics }.
export const estimateConfigFrom = (fabrics, profile) =>
  fabrics === null || fabrics === undefined ? null : { globals: classGlobalsFromProfile(profile), fabrics };
