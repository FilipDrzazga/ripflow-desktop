import { describe, it, expect } from "vitest";
import { shouldTick, pickDaysToPoll, mergePolledDays } from "./batchHistoryPoll.js";

// Pure module — no mocks. `now`/`visible` are injected, no timers.

describe("shouldTick", () => {
  const base = { visible: true, inFlight: false, lastTickAt: 0, now: 10_000, minGapMs: 5_000 };
  it("ticks when visible, idle and past the gap", () => {
    expect(shouldTick(base)).toBe(true);
  });
  it("never ticks while the window is hidden", () => {
    expect(shouldTick({ ...base, visible: false })).toBe(false);
  });
  it("never ticks while a tick is in flight", () => {
    expect(shouldTick({ ...base, inFlight: true })).toBe(false);
  });
  it("does not tick inside the min gap", () => {
    expect(shouldTick({ ...base, lastTickAt: 9_000 })).toBe(false); // 1000 < 5000
  });
  it("ticks exactly at the gap boundary", () => {
    expect(shouldTick({ ...base, lastTickAt: 5_000 })).toBe(true); // 5000 not < 5000
  });
});

describe("pickDaysToPoll", () => {
  const day = (dayFolder, loaded) => ({ dayFolder, date: dayFolder, loaded });
  const TODAY = "14-09-2026";

  it("always includes today when present, even as the only pick", () => {
    const groups = [day(TODAY, false), day("13-09-2026", false)];
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: new Set() })).toEqual([TODAY]);
  });

  it("omits today when it is not in the list", () => {
    const groups = [day("13-09-2026", true)];
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: new Set(["13-09-2026"]) })).toEqual([
      "13-09-2026",
    ]);
  });

  it("adds expanded+loaded days in list order after today", () => {
    const groups = [day(TODAY, true), day("13-09-2026", true), day("12-09-2026", true)];
    const expanded = new Set([TODAY, "13-09-2026", "12-09-2026"]);
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: expanded })).toEqual([
      TODAY,
      "13-09-2026",
      "12-09-2026",
    ]);
  });

  it("skips expanded-but-skeleton days (loaded !== true), except today", () => {
    const groups = [day(TODAY, false), day("13-09-2026", false), day("12-09-2026", true)];
    const expanded = new Set([TODAY, "13-09-2026", "12-09-2026"]);
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: expanded })).toEqual([TODAY, "12-09-2026"]);
  });

  it("caps at max, today counting toward it", () => {
    const groups = [day(TODAY, true), day("13-09-2026", true), day("12-09-2026", true), day("11-09-2026", true)];
    const expanded = new Set(groups.map((d) => d.date));
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: expanded, max: 3 })).toEqual([
      TODAY,
      "13-09-2026",
      "12-09-2026",
    ]);
  });

  it("does not double-count today when it is also expanded+loaded", () => {
    const groups = [day(TODAY, true), day("13-09-2026", true)];
    const expanded = new Set([TODAY, "13-09-2026"]);
    expect(pickDaysToPoll(groups, { todayFolder: TODAY, expandedDays: expanded, max: 3 })).toEqual([
      TODAY,
      "13-09-2026",
    ]);
  });
});

describe("mergePolledDays", () => {
  const skel = (dayFolder, label = null, totalBatches = 0) => ({
    dayFolder,
    date: dayFolder,
    label,
    totalBatches,
    batches: [],
    loaded: false,
  });
  const full = (dayFolder, label = null, batches = []) => ({
    dayFolder,
    date: dayFolder,
    label,
    totalBatches: batches.length,
    batches,
    loaded: true,
  });

  it("replaces a re-read day with its full object", () => {
    const prev = [full("14-09-2026", "Today", [{ path: "old" }])];
    const skeletons = [skel("14-09-2026", "Today", 2)];
    const days = [full("14-09-2026", "Today", [{ path: "a" }, { path: "b" }])];
    const out = mergePolledDays(prev, { skeletons, days });
    expect(out).toHaveLength(1);
    expect(out[0].loaded).toBe(true);
    expect(out[0].batches.map((b) => b.path)).toEqual(["a", "b"]);
  });

  it("adds a brand-new day from another station as a skeleton", () => {
    const prev = [full("13-09-2026", "Yesterday")];
    const skeletons = [skel("14-09-2026", "Today", 1), skel("13-09-2026", "Yesterday")];
    const out = mergePolledDays(prev, { skeletons, days: [] });
    expect(out.map((d) => d.dayFolder)).toEqual(["14-09-2026", "13-09-2026"]);
    expect(out[0]).toMatchObject({ dayFolder: "14-09-2026", loaded: false, totalBatches: 1 });
  });

  it("keeps a loaded day untouched (except label) when it was not re-read this tick", () => {
    const loadedDay = full("13-09-2026", "Yesterday", [{ path: "keep" }]);
    const prev = [loadedDay];
    const skeletons = [skel("13-09-2026", "2 days ago")]; // label rolled over past midnight
    const out = mergePolledDays(prev, { skeletons, days: [] });
    expect(out[0].batches.map((b) => b.path)).toEqual(["keep"]); // content preserved
    expect(out[0].loaded).toBe(true);
    expect(out[0].label).toBe("2 days ago"); // only the label refreshed
  });

  it("refreshes a prev skeleton from the new skeleton (totalBatches + label)", () => {
    const prev = [skel("10-09-2026", "old-label", 3)];
    const skeletons = [skel("10-09-2026", null, 5)];
    const out = mergePolledDays(prev, { skeletons, days: [] });
    expect(out[0]).toMatchObject({ dayFolder: "10-09-2026", totalBatches: 5, label: null, loaded: false });
  });

  it("drops a day that disappeared from the skeletons (deleted on disk)", () => {
    const prev = [full("14-09-2026", "Today"), full("13-09-2026", "Yesterday")];
    const skeletons = [skel("14-09-2026", "Today", 1)];
    const out = mergePolledDays(prev, { skeletons, days: [full("14-09-2026", "Today", [{ path: "x" }])] });
    expect(out.map((d) => d.dayFolder)).toEqual(["14-09-2026"]);
  });

  it("after load-all (5 loaded days) a 1-day poll leaves the other 4 loaded", () => {
    const folders = ["14-09-2026", "13-09-2026", "12-09-2026", "11-09-2026", "10-09-2026"];
    const prev = folders.map((f) => full(f, null, [{ path: `b-${f}` }]));
    const skeletons = folders.map((f) => skel(f));
    const days = [full("14-09-2026", null, [{ path: "fresh" }])]; // only today re-read
    const out = mergePolledDays(prev, { skeletons, days });
    expect(out.filter((d) => d.loaded === true)).toHaveLength(5);
    expect(out[0].batches[0].path).toBe("fresh"); // today replaced
    expect(out.slice(1).map((d) => d.batches[0].path)).toEqual(folders.slice(1).map((f) => `b-${f}`)); // rest kept
  });

  it("orders the result by the skeleton order", () => {
    const prev = [full("12-09-2026"), full("14-09-2026")];
    const skeletons = [skel("14-09-2026"), skel("13-09-2026"), skel("12-09-2026")];
    const out = mergePolledDays(prev, { skeletons, days: [] });
    expect(out.map((d) => d.dayFolder)).toEqual(["14-09-2026", "13-09-2026", "12-09-2026"]);
  });

  it("empty skeletons + non-empty prev -> prev untouched (transient outage, not a clear-out)", () => {
    const prev = [full("14-09-2026", "Today", [{ path: "a" }]), full("13-09-2026", "Yesterday")];
    const out = mergePolledDays(prev, { skeletons: [], days: [] });
    expect(out).toBe(prev); // same reference — nothing recomputed
  });

  it("empty skeletons + empty prev -> [] (nothing to keep, nothing to wipe)", () => {
    expect(mergePolledDays([], { skeletons: [], days: [] })).toEqual([]);
  });

  it("null/undefined skeletons + non-empty prev -> prev untouched", () => {
    const prev = [full("14-09-2026", "Today")];
    expect(mergePolledDays(prev, { skeletons: null, days: [] })).toBe(prev);
    expect(mergePolledDays(prev, { skeletons: undefined, days: [] })).toBe(prev);
  });
});
