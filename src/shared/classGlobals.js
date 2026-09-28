// The estimator's config, built from ONE source for the class numbers: the shop profile's
// materialClasses[] - their owner since profile v3 (ETAP 2g-3a/b, FILIP 2026-09-25, variant A).
// Used by the main process (fabricCache.getEstimateConfig) and the renderer (store.fabricConfig),
// so the two can never read the numbers from different places again (BUG 4, rule 23).
//
// Everything here works BY CLASS NAME since ETAP 4: the estimator (4-types-a) and the Settings ->
// Fabrics editor (4-types-b) - the four fixed keys (marginCotton, ...) and their helpers are gone.
// Pure, zero imports: carries a test without Electron, the DB or the store.

// The two class names validateShopProfile still requires in an imported profile (ETAP 3-2). Only
// the import validator reads this; 4-types-d relaxes it to "one or two classes, any names".
export const MATERIAL_CLASS_NAMES = ["Cottons", "Polyesters"];

// The editor's write (4-types-b): a NEW profile whose classes carry the numbers from `numbers` -
// { [className]: { margin, defaultRollWidth } }. Everything else - other classes, other fields,
// other profile sections - is copied untouched; the input is never mutated. A class the profile
// does not list is NOT added (the class list is the profile's own decision): it is reported in
// `missing` and the caller refuses to save.
export const withClassNumbersByName = (profile, numbers) => {
  const byName = numbers || {};
  const classes = Array.isArray(profile?.materialClasses) ? profile.materialClasses : [];
  const missing = Object.keys(byName).filter((name) => !classes.some((cls) => cls?.name === name));
  const materialClasses = classes.map((cls) => {
    if (!cls || !Object.hasOwn(byName, cls.name)) return cls;
    const own = byName[cls.name];
    return { ...cls, margin: own.margin, defaultRollWidth: own.defaultRollWidth };
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
// `globals`).
export const estimateConfigFrom = (fabrics, profile) =>
  fabrics === null || fabrics === undefined ? null : { classes: classNumbersFromProfile(profile), fabrics };
