// The background half of the Ctrl+F history search: list every PRINTED day as bare file names, newest day
// first, and report each day as it arrives. Pure of React and of window.api - the reader functions come in as
// arguments (hooks/usePrintedSearch.js passes the batchService ones) so the sweep tests without a renderer.
//
// The listing does not depend on the query, so the sweep runs ONCE per window and the matching is redone on
// every keystroke over what has arrived (orderSearch.js `printedDays`): typing never restarts it, and the cache
// below keeps a window opened a minute later from reading the share again.
//
// A day is cached for PRINTED_CACHE_TTL_MS. Short on purpose: a rollback removes a PDF from its batch folder and
// another station can print into today's day at any time, and the cache has no way to hear about either.

export const PRINTED_SCAN = {
  IDLE: "idle", // not started (the query never reached the minimum length)
  RUNNING: "running",
  DONE: "done", // every day read
  PARTIAL: "partial", // the day list or at least one day / batch could not be read
};

export const PRINTED_CACHE_TTL_MS = 5 * 60_000;

/**
 * @param {{ readDays: () => Promise<{success: boolean, data?: {dayFolder: string}[]}>,
 *           readDayNames: (dayFolder: string) => Promise<{success: boolean, data?: {unreadableBatches?: number}}>,
 *           cache?: Map<string, { at: number, data: object }>, now?: () => number }} deps
 */
export const createPrintedSweep = ({ readDays, readDayNames, cache = new Map(), now = Date.now }) => {
  /**
   * @param {{ onUpdate: (scan: { status: string, days: object[], listed: number, total: number }) => void,
   *           isCancelled?: () => boolean }} options
   */
  const run = async ({ onUpdate, isCancelled = () => false }) => {
    let folders;
    try {
      const res = await readDays();
      if (!res?.success || !Array.isArray(res.data)) throw new Error("day list not readable");
      folders = res.data.map((d) => d.dayFolder).filter((f) => typeof f === "string" && f !== "");
    } catch {
      if (!isCancelled()) onUpdate({ status: PRINTED_SCAN.PARTIAL, days: [], listed: 0, total: 0 });
      return;
    }

    const days = [];
    let failed = 0;
    const total = folders.length;
    if (!isCancelled()) onUpdate({ status: total === 0 ? PRINTED_SCAN.DONE : PRINTED_SCAN.RUNNING, days: [], listed: 0, total });

    for (let i = 0; i < total; i += 1) {
      const dayFolder = folders[i];
      if (isCancelled()) return;
      let data = null;
      const cached = cache.get(dayFolder);
      if (cached && now() - cached.at < PRINTED_CACHE_TTL_MS) {
        data = cached.data;
      } else {
        try {
          const res = await readDayNames(dayFolder);
          if (res?.success && res.data) {
            data = res.data;
            cache.set(dayFolder, { at: now(), data });
          }
        } catch {
          // a timeout or a dead share: this day stays out, the sweep goes on with the next one
        }
      }
      if (isCancelled()) return;
      if (!data || data.unreadableBatches > 0) failed += 1;
      if (data) days.push(data);
      const last = i === total - 1;
      onUpdate({
        status: last ? (failed > 0 ? PRINTED_SCAN.PARTIAL : PRINTED_SCAN.DONE) : PRINTED_SCAN.RUNNING,
        days: [...days],
        listed: i + 1,
        total,
      });
    }
  };

  return { run };
};
