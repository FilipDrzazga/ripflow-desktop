// Whether THIS station may run an Etsy import tick right now: null = yes, a string = why not. Pure - every
// fact is passed in, so the order and the fail-closed answers are tested without Electron (the loop in
// ipc/etsyImportLoop.js supplies the real facts).
//
// Every line is a way to be NOT the importer, and an unknown state is a "no" (W3): nothing is copied on a
// guess. The reason is logged once per CHANGE, so a station that is simply not the importer stays quiet.
//
//   paused:        the station sleeps, sits at the lock screen or is in the wake grace (helpers/powerPause.js)
//   dbOpen:        the shared database is open
//   featureOn:     getFeature("etsy") - false with no profile
//   enabled:       the per-machine switch (config.json etsyImportEnabled)
//   storageSet:    storagePath is set (getRootPath did not refuse)
//   libraryPath:   config.json etsyLibraryPath
//   since:         epoch seconds the import was switched on, or null
//   etsyStatus:    etsyCredentials.status(), or null when it could not be read
export const etsyImportGate = ({ paused, dbOpen, featureOn, enabled, storageSet, libraryPath, since, etsyStatus }) => {
  if (paused) return "the station sleeps or is locked";
  if (!dbOpen) return "there is no database";
  if (featureOn !== true) return "features.etsy is off in the shop profile (or the profile is not loaded)";
  if (enabled !== true) return "this station is not switched on as the Etsy importer (Settings > Etsy)";
  if (!storageSet) return "the storage folder is not set";
  if (!libraryPath) return "the Etsy library folder is not set (Settings > Etsy)";
  if (!Number.isInteger(since) || since <= 0) return "the import has no start date";
  if (!etsyStatus) return "the Etsy key cannot be read";
  if (!etsyStatus.connected || !etsyStatus.shopId) return "this station is not connected to Etsy (Settings > Etsy)";
  return null;
};
