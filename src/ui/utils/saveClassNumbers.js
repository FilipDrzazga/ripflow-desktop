// Saving the class numbers from Settings -> Fabrics (ETAP 2g-3c, variant A, FILIP 2026-09-25).
//
// Two writes, in this order:
//   1. profile:set - the shop profile's materialClasses, the numbers' owner since profile v3.
//      Every station on this version reads them from there.
//   2. fabricGlobals:set - the same four numbers in fabric_globals, ONLY for stations still on an
//      older version during the pilot (they read the numbers from there). The dual write goes
//      away once every station is upgraded (PRODUCTIZATION).
// The profile goes first: if it fails, nothing was written and nothing is split. If the second
// write fails, the stations have split (new ones see the new numbers, old ones the old) - that is
// reported as its own outcome so the view can say so, never folded into "saved".
//
// The IPC calls are injected so the sequence carries a test without window.api (rule 10: the
// view passes the services in). Returns { outcome, error? }:
//   "saved"          - both writes succeeded
//   "no-profile"     - the profile could not be read; nothing written
//   "missing-class"  - the profile lists no Cottons or no Polyesters class; nothing written
//   "profile-failed" - profile:set failed or did not answer; fabric_globals not touched
//   "legacy-failed"  - the profile was saved, the fabric_globals copy was not

import { CLASS_NUMBER_KEYS, withClassNumbers } from "../../shared/classGlobals";

const errorOf = (res, err, fallback) => err?.message || res?.error || fallback;

export const saveClassNumbers = async (values, { getProfile, setProfile, setLegacyGlobals }) => {
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
    if (!res?.success) return { outcome: "profile-failed", error: errorOf(res, null, "Could not save the shop profile.") };
  } catch (err) {
    // A timeout: the write may or may not have landed - the caller reloads and shows what is there.
    return { outcome: "profile-failed", error: errorOf(null, err, "The shop profile save did not answer.") };
  }

  try {
    const res = await setLegacyGlobals(numbers);
    if (!res?.success) return { outcome: "legacy-failed", error: errorOf(res, null, "Could not write fabric_globals.") };
  } catch (err) {
    return { outcome: "legacy-failed", error: errorOf(null, err, "The fabric_globals write did not answer.") };
  }
  return { outcome: "saved" };
};
