// How often the importer station asks Etsy for new orders (FILIP 2026-10-22: set in Settings > Etsy, per station).
// Used by both processes: main clamps what it stores and what the loop waits, the renderer clamps the field.
//
// The floor is the Etsy app limit, not taste: a tick is one page of the order list (+1 per 100 open orders) and up
// to MAX_UNLISTED_RETRY_ORDERS orders fetched by number for a Retry, so the worst case is ETSY_TICK_MAX_REQUESTS
// (~11) requests a tick. Every 2 minutes that is ~7,900 a day, under the usual 10,000 of an Etsy app; every minute
// would be ~15,800. Raising the retry bound raises both numbers - check the floor when it moves.
export const ETSY_IMPORT_MIN_MINUTES = 2;
export const ETSY_IMPORT_MAX_MINUTES = 60;
export const ETSY_IMPORT_DEFAULT_MINUTES = 2;

// How many orders outside the tick's list one tick fetches for their RETRY lines (retryUnlisted in
// src/electron/helpers/etsyImport.js); the rest wait for the next tick. A bound on the Etsy calls of a tick, not a
// limit a person reaches by hand. Here, not in the engine, because the renderer's pace line counts with it too.
export const MAX_UNLISTED_RETRY_ORDERS = 10;

// The most Etsy requests one tick makes (one page of the order list + the retry fetches) - the pace line in
// Settings > Etsy multiplies by it.
export const ETSY_TICK_MAX_REQUESTS = 1 + MAX_UNLISTED_RETRY_ORDERS;

// Anything that is not a whole number of minutes in range comes back as the default or the nearest bound.
export const clampEtsyImportMinutes = (value) => {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes)) return ETSY_IMPORT_DEFAULT_MINUTES;
  return Math.min(ETSY_IMPORT_MAX_MINUTES, Math.max(ETSY_IMPORT_MIN_MINUTES, minutes));
};
