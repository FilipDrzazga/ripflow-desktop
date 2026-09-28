// Ships empty on purpose: a fresh install starts with no materials. The fabric catalog
// is the shop's own data, entered in Settings > Fabrics or imported from a profile file
// (see profiles/). Seeding is guarded on this being non-empty, so it is a no-op today.
// The baked-in name lists that used to sit here (Alex's 33 cottons / 88 polyesters, unused
// since 0bf8aa6) were removed in ETAP 2g-1. DEFAULT_FABRIC_GLOBALS (the fabric_globals seed)
// went in 1.0.26 with the pilot's dual write: the class numbers live in the shop profile.
export const DEFAULT_FABRICS = [];
