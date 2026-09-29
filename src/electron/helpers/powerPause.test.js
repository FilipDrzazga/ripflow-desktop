import { describe, it, expect, beforeEach } from "vitest";
import { createPowerPause } from "./powerPause.js";

// ETAP 4 (4-power): the pause state machine - suspended OR locked OR in the grace after a resume.

let events;
let timers;
let pp;
const fireTimers = () => {
  const due = [...timers.values()];
  timers.clear();
  due.forEach((fn) => fn());
};

beforeEach(() => {
  events = [];
  timers = new Map();
  let next = 0;
  pp = createPowerPause({
    emit: (paused) => events.push(paused),
    graceMs: 10000,
    setTimer: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimer: (id) => timers.delete(id),
  });
});

describe("createPowerPause", () => {
  it("starts running and says nothing", () => {
    expect(pp.isPaused()).toBe(false);
    expect(events).toEqual([]);
  });

  it("suspend pauses; resume keeps the pause until the grace ends", () => {
    pp.suspend();
    expect(events).toEqual([true]);
    pp.resume();
    expect(pp.isPaused()).toBe(true);
    expect(events).toEqual([true]);
    fireTimers();
    expect(pp.isPaused()).toBe(false);
    expect(events).toEqual([true, false]);
  });

  it("lock and unlock pause and resume at once (no grace - the network never went away)", () => {
    pp.lock();
    pp.unlock();
    expect(events).toEqual([true, false]);
    expect(timers.size).toBe(0);
  });

  it("the usual night: lock, sleep, wake at the lock screen, grace ends, unlock - one pause", () => {
    pp.lock();
    pp.suspend();
    pp.resume();
    fireTimers();
    expect(pp.isPaused()).toBe(true); // still locked
    pp.unlock();
    expect(events).toEqual([true, false]);
  });

  it("unlock during the grace does not end the pause early", () => {
    pp.suspend();
    pp.lock();
    pp.resume();
    pp.unlock();
    expect(pp.isPaused()).toBe(true);
    fireTimers();
    expect(events).toEqual([true, false]);
  });

  it("a second sleep during the grace cancels the old timer", () => {
    pp.suspend();
    pp.resume();
    pp.suspend();
    expect(timers.size).toBe(0);
    expect(pp.isPaused()).toBe(true);
    pp.resume();
    fireTimers();
    expect(events).toEqual([true, false]);
  });

  it("a resume without a suspend changes nothing", () => {
    pp.resume();
    expect(events).toEqual([]);
    expect(timers.size).toBe(0);
  });

  it("emits on a transition only", () => {
    pp.lock();
    pp.lock();
    pp.suspend();
    expect(events).toEqual([true]);
  });
});
