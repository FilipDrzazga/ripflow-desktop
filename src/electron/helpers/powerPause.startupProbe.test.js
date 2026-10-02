import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPowerPause, applyStartupLock, STARTUP_PROBE_MS } from "./powerPause.js";

// dlug-12 round 2 (D21): on Windows "locked" also means "a screensaver runs", and ending a screensaver
// sends no unlock-screen event. A lock seen at startup is therefore re-probed until it ends, and any
// lock-screen / unlock-screen event takes over from the probe.

let timers; // id -> { fn, ms }
let emitted;
let pp;
let log;
const fireTimers = () => {
  const due = [...timers.values()];
  timers.clear();
  due.forEach(({ fn }) => fn());
};
// A state source that answers from a script, one answer per call, and counts the calls.
const script = (...answers) => {
  const calls = { n: 0 };
  const get = () => {
    const a = answers[Math.min(calls.n, answers.length - 1)];
    calls.n += 1;
    if (a instanceof Error) throw a;
    return a;
  };
  return { get, calls };
};

beforeEach(() => {
  timers = new Map();
  emitted = [];
  log = vi.fn();
  let next = 0;
  pp = createPowerPause({
    emit: (paused) => emitted.push(paused),
    graceMs: 10000,
    setTimer: (fn, ms) => {
      timers.set(++next, { fn, ms });
      return next;
    },
    clearTimer: (id) => timers.delete(id),
  });
});

describe("startup lock re-probe", () => {
  it("locked, locked, active: stays paused, then ends the pause once with one false event", () => {
    const s = script("locked", "locked", "locked", "active");
    expect(applyStartupLock(pp, s.get, log)).toBe(true);
    expect(timers.size).toBe(1);
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: true });
    expect(timers.size).toBe(1);
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: true });
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(emitted).toEqual([true, false]);
    expect(timers.size).toBe(0); // the probe ended with the state
    expect(s.calls.n).toBe(4);
  });

  it("re-probes every STARTUP_PROBE_MS", () => {
    applyStartupLock(pp, script("locked").get, log);
    expect([...timers.values()].map((t) => t.ms)).toEqual([STARTUP_PROBE_MS]);
    expect(STARTUP_PROBE_MS).toBeGreaterThanOrEqual(15000);
    expect(STARTUP_PROBE_MS).toBeLessThanOrEqual(30000);
  });

  it("an unlock-screen event stops the probe: no further getState calls", () => {
    const s = script("locked");
    applyStartupLock(pp, s.get, log);
    pp.unlock();
    expect(timers.size).toBe(0);
    fireTimers();
    expect(s.calls.n).toBe(1); // only the startup call
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(emitted).toEqual([true, false]);
  });

  it("a lock-screen event stops the probe too: the pause then waits for a real unlock", () => {
    const s = script("locked", "active");
    applyStartupLock(pp, s.get, log);
    pp.lock();
    expect(timers.size).toBe(0);
    fireTimers();
    expect(s.calls.n).toBe(1);
    expect(pp.snapshot()).toEqual({ paused: true });
    pp.unlock();
    expect(pp.snapshot()).toEqual({ paused: false });
  });

  it("a throwing re-probe ends the pause (fail open) and logs", () => {
    const s = script("locked", new Error("boom"));
    applyStartupLock(pp, s.get, log);
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(emitted).toEqual([true, false]);
    expect(timers.size).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("boom");
  });

  it("ending the probe does not end a sleep that began meanwhile", () => {
    applyStartupLock(pp, script("locked", "active").get, log);
    pp.suspend();
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: true });
  });

  it("starting with anything but locked schedules no timer at all", () => {
    for (const state of ["active", "idle", "unknown", undefined]) {
      expect(applyStartupLock(pp, script(state).get, log)).toBe(false);
    }
    expect(applyStartupLock(pp, script(new Error("x")).get, log)).toBe(false);
    expect(timers.size).toBe(0);
    expect(pp.snapshot()).toEqual({ paused: false });
  });
});
