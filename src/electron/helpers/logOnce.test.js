import { describe, it, expect } from "vitest";
import { createLogOnce } from "./logOnce.js";

// Pure module, injected clock - no timers, no sleep.

describe("createLogOnce", () => {
  it("logs the first time a key is seen", () => {
    const shouldLog = createLogOnce({ windowMs: 1000, now: () => 0 });
    expect(shouldLog("a")).toBe(true);
  });

  it("suppresses a repeat within the window", () => {
    let clock = 0;
    const shouldLog = createLogOnce({ windowMs: 1000, now: () => clock });
    expect(shouldLog("a")).toBe(true);
    clock = 999; // still inside the window
    expect(shouldLog("a")).toBe(false);
  });

  it("logs again once the window has elapsed", () => {
    let clock = 0;
    const shouldLog = createLogOnce({ windowMs: 1000, now: () => clock });
    expect(shouldLog("a")).toBe(true);
    clock = 1000; // exactly at the boundary -> no longer inside the window
    expect(shouldLog("a")).toBe(true);
  });

  it("tracks keys independently", () => {
    let clock = 0;
    const shouldLog = createLogOnce({ windowMs: 1000, now: () => clock });
    expect(shouldLog("a")).toBe(true);
    expect(shouldLog("b")).toBe(true); // different key, not throttled by "a"
    clock = 500;
    expect(shouldLog("a")).toBe(false);
    expect(shouldLog("b")).toBe(false);
  });

  it("defaults to a one-hour window and Date.now when no options are given", () => {
    const shouldLog = createLogOnce();
    expect(shouldLog("x")).toBe(true);
    expect(shouldLog("x")).toBe(false); // second call is well within an hour
  });
});
