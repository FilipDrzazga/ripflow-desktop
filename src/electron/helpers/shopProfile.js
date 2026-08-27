import { getShopProfile } from "./db.js";
import { DEFAULT_PROFILE } from "./defaultProfile.js";

// null = not loaded (DB unreachable, or the read threw); object = loaded.
// Same sentinel discipline as fabricCache.js: "not loaded" and "loaded but empty"
// are different answers and callers are allowed to tell them apart.
let cachedProfile = null;

export const loadShopProfile = () => {
  try {
    // db.getShopProfile returns null for "no row" and THROWS on a DB or JSON failure,
    // deliberately not collapsing the two. A missing row is a fresh install, so the
    // in-memory default stands in; a throw means we know nothing and must say so.
    const row = getShopProfile();
    cachedProfile = row ?? DEFAULT_PROFILE;
  } catch (err) {
    console.error("[shopProfile] loadShopProfile failed:", err);
    cachedProfile = null;
  }
};

export const invalidateShopProfile = () => {
  cachedProfile = null;
};

// null = cache not loaded. Callers decide what that means for them — this helper
// never substitutes a default behind their back.
export const getProfile = () => cachedProfile;

export const getPrinters = () => {
  if (cachedProfile === null) return [];
  // The profile is a free-form JSON blob in one column, so a hand-edited or
  // half-imported row can carry anything. Shape-check at the point of use.
  return Array.isArray(cachedProfile.printers) ? cachedProfile.printers : [];
};

export const getPrinterByCode = (code) => {
  if (!code) return null;
  const wanted = String(code).toUpperCase();
  return getPrinters().find((p) => String(p?.code).toUpperCase() === wanted) ?? null;
};

// Fail-closed: no profile means no feature. A dark button is a worse experience;
// a live button wired to a config we could not read is a wrong link or a wrong path.
// Strict === true, so a missing key or a truthy-but-not-boolean value stays off.
export const getFeature = (name) => {
  if (cachedProfile === null) return false;
  return cachedProfile.features?.[name] === true;
};
