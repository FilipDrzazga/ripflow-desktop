import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createPowerPause, applyStartupLock } from "./powerPause.js";

// dlug-12 (D21): a launch while the screen is already locked gets no lock-screen event.

let emitted;
let pp;
beforeEach(() => {
  emitted = [];
  pp = createPowerPause({ emit: (paused) => emitted.push(paused), setTimer: () => 1, clearTimer: () => {} });
});

describe("applyStartupLock", () => {
  it("locks the pause when the system reports locked", () => {
    const log = vi.fn();
    expect(applyStartupLock(pp, () => "locked", log)).toBe(true);
    expect(pp.snapshot()).toEqual({ paused: true });
    expect(emitted).toEqual([true]);
    expect(log).not.toHaveBeenCalled();
  });

  it.each(["active", "idle", "unknown", undefined, null])("does nothing for %s", (state) => {
    expect(applyStartupLock(pp, () => state, vi.fn())).toBe(false);
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(emitted).toEqual([]);
  });

  it("a throwing probe is a no-op plus a log line, never a startup error", () => {
    const log = vi.fn();
    expect(applyStartupLock(pp, () => { throw new Error("boom"); }, log)).toBe(false);
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("boom");
  });

  it("the unlock after such a start ends the pause with the ordinary event", () => {
    applyStartupLock(pp, () => "locked", vi.fn());
    pp.unlock();
    expect(pp.snapshot()).toEqual({ paused: false });
    expect(emitted).toEqual([true, false]);
  });
});

describe("main.js wiring", () => {
  // Harness guard: main.js cannot be imported from a test, so the call is pinned by its text.
  const main = readFileSync(fileURLToPath(new URL("../main.js", import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("probes powerMonitor.getSystemIdleState(0) on the SAME powerPause instance, after the events are wired", () => {
    expect(main).toMatch(/applyStartupLock\(powerPause, \(\) => powerMonitor\.getSystemIdleState\(0\)\);/);
    expect(main.indexOf("applyStartupLock(powerPause")).toBeGreaterThan(main.indexOf('powerMonitor.on("unlock-screen"'));
    expect(main).toMatch(/import \{[^}]*\bapplyStartupLock\b[^}]*\} from "\.\/helpers\/powerPause\.js";/);
  });
});
