import { describe, it, expect } from "vitest";
import { pollsStand, pollsResumed } from "./pollingGate";

describe("pollsStand - one computed condition from two independent sources", () => {
  it("runs only when neither source stops the polls", () => {
    expect(pollsStand({ pollingPaused: false, windowHidden: false })).toBe(false);
  });

  it("stands on a power pause alone", () => {
    expect(pollsStand({ pollingPaused: true, windowHidden: false })).toBe(true);
  });

  it("stands on a hidden window alone", () => {
    expect(pollsStand({ pollingPaused: false, windowHidden: true })).toBe(true);
  });

  it("a wake (power pause over) while the window is still hidden does not start the polls", () => {
    expect(pollsStand({ pollingPaused: false, windowHidden: true })).toBe(true);
  });

  it("the window coming back during a power pause does not start the polls either", () => {
    expect(pollsStand({ pollingPaused: true, windowHidden: false })).toBe(true);
  });

  it("a source that was never written (undefined) does not stop the polls", () => {
    expect(pollsStand({})).toBe(false);
  });

  it("only a real boolean true counts - a stray truthy value does not", () => {
    expect(pollsStand({ pollingPaused: "true", windowHidden: 1 })).toBe(false);
  });
});

describe("pollsResumed - the edge the polls restart on", () => {
  it("fires on stopped -> running", () => {
    expect(pollsResumed(true, false)).toBe(true);
  });

  it("does not fire while still running, still stopped, or when it just stopped", () => {
    expect(pollsResumed(false, false)).toBe(false);
    expect(pollsResumed(true, true)).toBe(false);
    expect(pollsResumed(false, true)).toBe(false);
  });
});
