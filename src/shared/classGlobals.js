// The estimator's config, built from ONE source for the class numbers: the shop profile's
// materialClasses[] - their owner since profile v3 (ETAP 2g-3a/b, FILIP 2026-09-25, variant A).
// Used by the main process (fabricCache.getEstimateConfig) and the renderer (store.fabricConfig),
// so the two can never read the numbers from different places again (BUG 4, rule 23).
//
// Since ETAP 4 (4-types-a) estimatePrintLength reads the numbers BY CLASS NAME
// (classNumbersFromProfile -> config.classes). The four keys below (marginCotton, marginPoly,
// defaultRollWidthCotton, defaultRollWidthPoly) are what the Settings -> Fabrics editor still
// shows and saves for the Cottons / Polyesters entries (classGlobalsFromProfile /
// withClassNumbers); they no longer feed the estimator.
// Pure, zero imports: carries a test without Electron, the DB or the store.

const CLASS_KEYS = {
  Cottons: { margin: "marginCotton", defaultRollWidth: "defaultRollWidthCotton" },
  Polyesters: { margin: "marginPoly", defaultRollWidth: "defaultRollWidthPoly" },
};

// The material classes the app knows: the class of a fabric is one of these two (fabrics.type),
// and only these carry class numbers. validateShopProfile refuses a profile class outside this
// list (ETAP 3-2) - relax both together once getMaterialType reads the classes from the profile.
export const MATERIAL_CLASS_NAMES = Object.keys(CLASS_KEYS);

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

// The class numbers BY CLASS NAME (ETAP 4, 4-types-a): profile -> { [name]: { margin?,
// defaultRollWidth? } } for every class the profile lists, whatever it is called - a client who
// names its classes "Cotton" / "Poly" gets its own numbers, not the Polyesters branch the four
// fixed keys above sent every non-"Cottons" name to. A field with no finite number is absent
// (the estimator then falls back to the class constant, for the two names printWidths.js knows).
// No profile / no materialClasses -> {}.
export const classNumbersFromProfile = (profile) => {
  const out = {};
  if (!profile || !Array.isArray(profile.materialClasses)) return out;
  for (const cls of profile.materialClasses) {
    if (!cls || typeof cls !== "object" || typeof cls.name !== "string" || cls.name === "") continue;
    if (Object.hasOwn(out, cls.name)) continue; // first entry of a name wins, like printers[]
    const numbers = {};
    for (const field of ["margin", "defaultRollWidth"]) {
      if (typeof cls[field] === "number" && Number.isFinite(cls[field])) numbers[field] = cls[field];
    }
    out[cls.name] = numbers;
  }
  return out;
};

// The estimator config, or null. `fabrics` is the catalogue: null = not loaded, and then the
// answer is null - NEVER { fabrics: [] } (rule 23: an empty array is truthy and would drag the
// estimator into its catalogue branch with an empty catalogue). A loaded catalogue, even an
// empty one, gives { classes, fabrics } (4-types-a: `classes` by name replaced the four-key
// `globals`, which classGlobalsFromProfile still builds for the Settings editor).
export const estimateConfigFrom = (fabrics, profile) =>
  fabrics === null || fabrics === undefined ? null : { classes: classNumbersFromProfile(profile), fabrics };
