import { isDbOpen, initDb } from "./db.js";
import { runShopProfileMigration } from "./runShopProfileMigration.js";
import { loadShopProfile } from "./shopProfile.js";
import { loadFabricCache } from "./fabricCache.js";

// ETAP 4 (4-retry): ONE mechanism that (re)loads the shop data this process caches - the shop
// profile and the fabric catalogue (PRODUCTIZATION "Cache nie wstaje po odzyskaniu bazy"). Both
// used to load once at startup: a station whose NAS was down then kept the null sentinels, and
// with them no gated feature, labels, RIP errors or scan rules, until the app was restarted.
//
// loadShopData - both caches, profile FIRST (the fabric layer reads the profile's classes);
//   startup calls it, so startup and a reload cannot drift apart.
// reloadShopData - the operator's "Reload shop data" / the banner's Retry:
//   1. no database handle (initDb failed at startup) -> initDb again, then the profile
//      migration, exactly the startup order. A LIVE handle is never replaced.
//   2. both caches, with the startup contract unchanged: a read that fails leaves the null
//      sentinel, also over a value loaded before (shop-profile.md - a stale profile served
//      quietly is worse than admitting ignorance). The answer says which cache failed.
// One reload at a time: a second call while one runs gets the SAME promise (initDb on a dead
// share can block for the SMB timeout, and the operator will click again).

export const loadShopData = () => ({
  profile: loadShopProfile(),
  fabrics: loadFabricCache(),
});

let inFlight = null;

const run = async () => {
  const wasOpen = isDbOpen();
  if (!wasOpen) {
    initDb();
    if (isDbOpen()) await runShopProfileMigration();
  }
  const loaded = loadShopData();
  return {
    success: true,
    dbOpen: isDbOpen(),
    reopened: !wasOpen && isDbOpen(),
    profile: loaded.profile ? "reloaded" : "missing",
    fabrics: loaded.fabrics ? "reloaded" : "missing",
  };
};

export const reloadShopData = () => {
  if (!inFlight) {
    inFlight = run()
      .catch((err) => {
        console.error("[reloadShopData] failed:", err);
        return { success: false, error: err?.message ?? String(err) };
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};
