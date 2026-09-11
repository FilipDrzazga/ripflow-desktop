// A throttle for repetitive diagnostics: shouldLog(key) is true the first time a key is
// seen and again only once windowMs has passed since the last true for that key.
//
// Why a time window and NOT "once per session": this app runs 24/7 and a session lasts
// weeks. A share that hangs, recovers, and hangs again hours later is a NEW event worth a
// NEW log line - "once per session" would hide the second outage entirely. windowMs
// (default 1h) collapses the burst without silencing the recurrence.
//
// No size cap on the map, on purpose. The keys are printed-folder paths; the live share
// was measured at ~1600 batch folders, so the map is bounded by the filesystem, not by
// traffic. A cap with eviction would only reintroduce the duplicate logs this exists to
// prevent (an evicted key logs again immediately). Zero imports, so it carries a test
// without touching Electron, fs or the DB - the clock is injected.
export const createLogOnce = ({ windowMs = 60 * 60 * 1000, now = () => Date.now() } = {}) => {
  const lastLoggedAt = new Map(); // key -> ms timestamp of the last true

  return (key) => {
    const t = now();
    const last = lastLoggedAt.get(key);
    if (last !== undefined && t - last < windowMs) return false;
    lastLoggedAt.set(key, t);
    return true;
  };
};
