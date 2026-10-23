// Which stations are switched on as the Etsy importer (plan IMP-W). Every station that has the switch On writes a
// heartbeat row into the shared database after each tick (etsy_importers: station name, its interval, the time);
// Settings > Etsy reads the rows to warn when a SECOND station imports - two importers do not duplicate a file (the
// claim is one INSERT OR IGNORE) but they double the Etsy requests and the one that meets a problem first parks the
// line for both. Pure, so both processes and the tests share one rule.

// A heartbeat is "alive" for three of the station's own intervals, but never for less than ten minutes (a tick can
// wait for a slow share, and the first one comes a minute after start-up).
export const ETSY_IMPORTER_MIN_ALIVE_MS = 10 * 60 * 1000;
export const ETSY_IMPORTER_ALIVE_INTERVALS = 3;

export const importerAliveMs = (intervalMin) => {
  const own = Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin * 60 * 1000 : 0;
  return Math.max(ETSY_IMPORTER_MIN_ALIVE_MS, ETSY_IMPORTER_ALIVE_INTERVALS * own);
};

// rows: [{ workstation, intervalMin, lastTickAt (ISO) }] -> [{ workstation, minutesAgo }] of the OTHER stations whose
// heartbeat is alive, the newest first. A row with an unreadable time is not alive; a time in the future (a station
// whose clock runs ahead) counts as "now".
export const otherLiveImporters = (rows, ownWorkstation, nowMs) => {
  const own = String(ownWorkstation ?? "").trim().toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.workstation === "string" && row.workstation.trim() !== "" && row.workstation.trim().toLowerCase() !== own)
    .map((row) => ({ workstation: row.workstation.trim(), ageMs: nowMs - Date.parse(row.lastTickAt ?? ""), intervalMin: row.intervalMin }))
    .filter((row) => Number.isFinite(row.ageMs) && row.ageMs < importerAliveMs(row.intervalMin))
    .map((row) => ({ workstation: row.workstation, minutesAgo: Math.max(0, Math.floor(row.ageMs / 60000)) }))
    .sort((a, b) => a.minutesAgo - b.minutesAgo);
};
