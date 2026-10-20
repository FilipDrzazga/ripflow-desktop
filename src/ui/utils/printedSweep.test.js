import { describe, it, expect, vi } from "vitest";
import { PRINTED_CACHE_TTL_MS, PRINTED_SCAN, createPrintedSweep } from "./printedSweep";

const names = (dayFolder, extra = {}) => ({ success: true, data: { dayFolder, batches: [], unreadableBatches: 0, ...extra } });
const days = (...folders) => ({ success: true, data: folders.map((dayFolder) => ({ dayFolder })) });

// Collects every update the sweep reports, in order.
const run = async (deps, options = {}) => {
  const updates = [];
  const sweep = createPrintedSweep(deps);
  await sweep.run({ onUpdate: (u) => updates.push(u), ...options });
  return { updates, last: updates.at(-1), sweep };
};

describe("createPrintedSweep", () => {
  it("lists the days in the order readDays gives them (newest first) and reports each as it arrives", async () => {
    const readDayNames = vi.fn(async (d) => names(d));
    const { updates, last } = await run({ readDays: async () => days("19-10-2026", "18-10-2026", "17-10-2026"), readDayNames });

    expect(readDayNames.mock.calls.map((c) => c[0])).toEqual(["19-10-2026", "18-10-2026", "17-10-2026"]);
    expect(updates.map((u) => [u.status, u.listed, u.total])).toEqual([
      [PRINTED_SCAN.RUNNING, 0, 3],
      [PRINTED_SCAN.RUNNING, 1, 3],
      [PRINTED_SCAN.RUNNING, 2, 3],
      [PRINTED_SCAN.DONE, 3, 3],
    ]);
    expect(last.days.map((d) => d.dayFolder)).toEqual(["19-10-2026", "18-10-2026", "17-10-2026"]);
  });

  it("an empty PRINTED folder is DONE at once, with nothing listed", async () => {
    const { updates } = await run({ readDays: async () => days(), readDayNames: vi.fn() });
    expect(updates).toEqual([{ status: PRINTED_SCAN.DONE, days: [], listed: 0, total: 0 }]);
  });

  it("a day that cannot be read leaves the sweep going and makes the result PARTIAL, never DONE", async () => {
    const readDayNames = vi.fn(async (d) => {
      if (d === "18-10-2026") throw new Error("IPC timeout");
      return names(d);
    });
    const { last } = await run({ readDays: async () => days("19-10-2026", "18-10-2026", "17-10-2026"), readDayNames });
    expect(readDayNames).toHaveBeenCalledTimes(3);
    expect(last.status).toBe(PRINTED_SCAN.PARTIAL);
    expect(last.days.map((d) => d.dayFolder)).toEqual(["19-10-2026", "17-10-2026"]);
  });

  it("an answer with success:false counts as unreadable too", async () => {
    const { last } = await run({
      readDays: async () => days("19-10-2026"),
      readDayNames: async () => ({ success: false, errors: [{ code: "EPERM" }] }),
    });
    expect(last.status).toBe(PRINTED_SCAN.PARTIAL);
    expect(last.days).toEqual([]);
  });

  it("a day with unreadable batches is kept (its other files are searchable) but the result is PARTIAL", async () => {
    const { last } = await run({
      readDays: async () => days("19-10-2026"),
      readDayNames: async (d) => names(d, { unreadableBatches: 2 }),
    });
    expect(last.status).toBe(PRINTED_SCAN.PARTIAL);
    expect(last.days).toHaveLength(1);
  });

  it("a day list that cannot be read is PARTIAL with nothing listed (not 'not found')", async () => {
    for (const readDays of [async () => ({ success: false }), async () => { throw new Error("IPC timeout"); }]) {
      const { updates } = await run({ readDays, readDayNames: vi.fn() });
      expect(updates).toEqual([{ status: PRINTED_SCAN.PARTIAL, days: [], listed: 0, total: 0 }]);
    }
  });

  it("serves a day from the cache within the TTL and reads it again after", async () => {
    const cache = new Map();
    let clock = 1_000;
    const readDayNames = vi.fn(async (d) => names(d));
    const deps = { readDays: async () => days("19-10-2026", "18-10-2026"), readDayNames, cache, now: () => clock };

    await run(deps);
    expect(readDayNames).toHaveBeenCalledTimes(2);

    clock += PRINTED_CACHE_TTL_MS - 1;
    const second = await run(deps);
    expect(readDayNames).toHaveBeenCalledTimes(2); // all from the cache
    expect(second.last.status).toBe(PRINTED_SCAN.DONE);
    expect(second.last.days).toHaveLength(2);

    clock += 2;
    await run(deps);
    expect(readDayNames).toHaveBeenCalledTimes(4);
  });

  it("does not cache a day it could not read", async () => {
    const cache = new Map();
    const readDayNames = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValue(names("19-10-2026"));
    const deps = { readDays: async () => days("19-10-2026"), readDayNames, cache };
    await run(deps);
    expect(cache.size).toBe(0);
    const again = await run(deps);
    expect(again.last.status).toBe(PRINTED_SCAN.DONE);
    expect(readDayNames).toHaveBeenCalledTimes(2);
  });

  it("stops at once when cancelled: no further reads, no further updates", async () => {
    let cancelled = false;
    const readDayNames = vi.fn(async (d) => {
      cancelled = true; // the window closes while the first day is being read
      return names(d);
    });
    const { updates } = await run(
      { readDays: async () => days("19-10-2026", "18-10-2026", "17-10-2026"), readDayNames },
      { isCancelled: () => cancelled },
    );
    expect(readDayNames).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1); // only the initial RUNNING, nothing after the cancel
  });

  it("hands out a fresh days array on every update (React compares by identity)", async () => {
    const { updates } = await run({ readDays: async () => days("19-10-2026", "18-10-2026"), readDayNames: async (d) => names(d) });
    expect(new Set(updates.map((u) => u.days)).size).toBe(updates.length);
  });
});
