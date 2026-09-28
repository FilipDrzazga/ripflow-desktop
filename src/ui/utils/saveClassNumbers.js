// Saving the class numbers from Settings -> Fabrics (ETAP 2g-3c).
//
// ONE write: profile:set - the shop profile's materialClasses, the numbers' owner since profile
// v3; every station reads them from there. During the 2G pilot a second write copied the same
// four numbers to fabric_globals for stations still on an older version; that dual write went in
// 1.0.26, once every station ran 1.0.25 (FILIP 2026-09-28 10:49).
//
// The IPC calls are injected so the sequence carries a test without window.api (rule 10: the
// view passes the services in). Returns { outcome, error? }:
//   "saved"           - the profile was written
//   "no-profile"      - the profile could not be read; nothing written
//   "missing-class"   - the profile lists no Cottons or no Polyesters class; nothing written
//   "profile-changed" - profile:set refused: another station saved the profile after this one
//                       loaded it (ETAP 3-1); nothing written
//   "profile-failed"  - profile:set failed or did not answer

import { CLASS_NUMBER_KEYS, withClassNumbers } from "../../shared/classGlobals";
import { PROFILE_CHANGED } from "../../shared/constants";

const errorOf = (res, err, fallback) => err?.message || res?.error || fallback;

export const saveClassNumbers = async (values, { getProfile, setProfile }) => {
  const numbers = {};
  for (const key of CLASS_NUMBER_KEYS) numbers[key] = Number(values[key]);

  // A fresh read, not the store's copy: the write replaces the WHOLE profile row.
  let profile = null;
  try {
    const res = await getProfile();
    if (res?.success) profile = res.data ?? null;
  } catch (err) {
    console.error("[saveClassNumbers] profile:get failed:", err);
  }
  if (!profile) return { outcome: "no-profile", error: "The shop profile could not be read." };

  const { profile: next, missing } = withClassNumbers(profile, numbers);
  if (missing.length) {
    return { outcome: "missing-class", error: `The shop profile has no class: ${missing.join(", ")}.` };
  }

  try {
    const res = await setProfile(next);
    if (res?.code === PROFILE_CHANGED) return { outcome: "profile-changed", error: res.error };
    if (!res?.success) return { outcome: "profile-failed", error: errorOf(res, null, "Could not save the shop profile.") };
  } catch (err) {
    // A timeout: the write may or may not have landed - the caller reloads and shows what is there.
    return { outcome: "profile-failed", error: errorOf(null, err, "The shop profile save did not answer.") };
  }
  return { outcome: "saved" };
};
