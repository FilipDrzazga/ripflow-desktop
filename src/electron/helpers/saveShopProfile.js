import { getShopProfileRaw, migrateShopProfileRow } from "./db.js";
import { getProfile, invalidateShopProfile, loadShopProfile } from "./shopProfile.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";
import { PROFILE_CHANGED } from "../../shared/constants.js";

// profile:set (ETAP 3-1): the shop profile is written ONLY when the stored row is still the one
// this station loaded. Every writer replaces the WHOLE row with a patched copy of its own cache,
// and that cache is read once at startup - so a station that has not restarted since another
// station saved (an import, a class-number edit) would put the old profile back without a word.
// That lost update is what this guards against; nobody else would notice it.
//
// Two checks, because they close two different windows:
//   1. the row NOW vs the profile THIS STATION LOADED - compared as data (key order ignored),
//      because the cache holds the parsed object, not the column text. It catches every save
//      made by another station since this one started.
//   2. the write itself is a compare-and-swap on the row text read in step 1
//      (migrateShopProfileRow) - it catches a save that lands between that read and the write.
//
// Lives in its own module for the same reason as runShopProfileMigration.js: ipc/index.js
// cannot be reached from a test, and here db.js is the single edge to mock.
//
// Returns { success: true } | { success: false, code?, error }. code === PROFILE_CHANGED is the
// refusal above - the caller tells it apart from a failure (Warning vs Error). The cache is
// reloaded whatever happened, so it mirrors what the DB holds now - after a refusal that is the
// other station's profile, which is what the operator has to look at before saving again.

const CHANGED_MESSAGE =
  "The shop profile was changed on another station after this one loaded it. Nothing was saved.";

// Key-order-insensitive serialisation; array order is kept (printers[] is ordered).
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );

const attemptSave = (next, workstation) => {
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return { success: false, error: "Profile must be an object." };
  }
  const loaded = getProfile();
  // No baseline, nothing to compare against: the DB was unreadable at startup.
  if (loaded === null) {
    return { success: false, error: "The shop profile was not loaded on this station. Restart the app before saving it." };
  }
  // The in-memory stand-in for a missing row (loadShopProfile). initDb seeds a row on every
  // start, so this station started before one existed; a restart loads the real row.
  if (loaded === DEFAULT_PROFILE) {
    return { success: false, error: "The shop profile has no row in the database yet. Restart the app before saving it." };
  }

  let raw;
  try {
    raw = getShopProfileRaw();
  } catch (err) {
    console.error("[saveShopProfile] could not read the profile row:", err);
    return { success: false, error: err?.message ?? "Could not read the shop profile." };
  }
  if (raw === null) return { success: false, code: PROFILE_CHANGED, error: CHANGED_MESSAGE };

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    // This station loaded valid JSON, so the row has been rewritten since.
    return { success: false, code: PROFILE_CHANGED, error: CHANGED_MESSAGE };
  }
  if (canonical(stored) !== canonical(loaded)) {
    return { success: false, code: PROFILE_CHANGED, error: CHANGED_MESSAGE };
  }

  let updated;
  try {
    ({ updated } = migrateShopProfileRow(raw, JSON.stringify(next), workstation));
  } catch (err) {
    console.error("[saveShopProfile] profile write failed:", err);
    return { success: false, error: err?.message ?? "Could not save the shop profile." };
  }
  if (!updated) return { success: false, code: PROFILE_CHANGED, error: CHANGED_MESSAGE };
  return { success: true };
};

export const saveShopProfile = (next, workstation) => {
  const result = attemptSave(next, workstation);
  invalidateShopProfile();
  loadShopProfile();
  return result;
};
