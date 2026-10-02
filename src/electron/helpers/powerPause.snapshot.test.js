import { describe, it, expect, beforeEach } from "vitest";
import { createPowerPause } from "./powerPause.js";

// dlug-6 (D4): the answer to power:get-paused. A window that loads or reloads while the station is
// locked missed the transition event, so the renderer asks for the CURRENT state once at startup.

let timers;
let pp;
const fireTimers = () => {
  const due = [...timers.values()];
  timers.clear();
  due.forEach((fn) => fn());
};

beforeEach(() => {
  timers = new Map();
  let next = 0;
  // emit goes nowhere: the renderer that would have heard it is the one that reloaded.
  pp = createPowerPause({
    emit: () => {},
    graceMs: 10000,
    setTimer: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimer: (id) => timers.delete(id),
  });
});

describe("createPowerPause snapshot", () => {
  it("answers { paused: false } before anything happened", () => {
    expect(pp.snapshot()).toEqual({ paused: false });
  });

  it("answers the state a missed event would have carried: locked", () => {
    pp.lock();
    expect(pp.snapshot()).toEqual({ paused: true });
    pp.unlock();
    expect(pp.snapshot()).toEqual({ paused: false });
  });

  it("stays paused through the wake grace and ends with it", () => {
    pp.suspend();
    pp.resume();
    expect(pp.snapshot()).toEqual({ paused: true });
    fireTimers();
    expect(pp.snapshot()).toEqual({ paused: false });
  });

  it("agrees with isPaused through the usual night", () => {
    pp.lock();
    pp.suspend();
    pp.resume();
    fireTimers();
    expect(pp.snapshot().paused).toBe(pp.isPaused());
    expect(pp.snapshot()).toEqual({ paused: true }); // still locked
    pp.unlock();
    expect(pp.snapshot()).toEqual({ paused: false });
  });
});
