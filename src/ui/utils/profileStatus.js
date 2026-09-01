// Maps one profile:get result onto a load status the UI can act on.
//
// The renderer used to carry a bare `shopProfile: null`, which conflated three
// different situations: not asked yet, in flight, and failed. The banner had to guess
// between them with `!isLoading`, a timing proxy rather than a fact. This turns the
// guess into a stored answer.

export const PROFILE_STATUS = {
  LOADING: "loading",
  LOADED: "loaded",
  FAILED: "failed",
};

// WHY data === null now means FAILURE, not "fresh install":
// before 2c-null-a, db.getShopProfile answered null both for "no database" and for
// "no row", and shopProfile.js turned that into DEFAULT_PROFILE. Since that fix the
// !db guard THROWS, loadShopProfile catches it and leaves cachedProfile === null, and
// a genuinely absent row still resolves to DEFAULT_PROFILE. So the only way main can
// hand the renderer a null profile today is that it could not read the database at
// all. Do not "restore" a fresh-install reading here — it would put the old collapse
// back on the renderer side of the wire.
//
// An object with no keys is treated as a failure too. It carries no configuration, so
// calling it loaded would hide the gated tabs (isViewEnabled fail-closes on a missing
// features block) while suppressing the banner that explains why — fewer tabs and no
// reason given, the worst of both. The check stays mechanical on purpose: a plain
// object with at least one key. Validating individual fields is schema work and does
// not belong in a status mapper.
const isUsableProfile = (data) =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  Object.keys(data).length > 0;

// Fail-closed in the same direction as getFeature: anything we do not understand is a
// failure. Note this never sees a timeout — withTimeout REJECTS, so the store's catch
// handles that case and sets the same failed pair.
export const resolveProfileResult = (res) => {
  if (res?.success === true && isUsableProfile(res.data)) {
    return { status: PROFILE_STATUS.LOADED, profile: res.data };
  }
  return { status: PROFILE_STATUS.FAILED, profile: null };
};
