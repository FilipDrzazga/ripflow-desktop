import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// B2a: the .jsx files and the hook cannot be imported from a test (no DOM harness, rejected in
// 50f64c8), so the wiring is pinned by reading the sources - the same device as
// rangeSelectWiring.test.js. pollingGate.test.js covers the pure condition.

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const app = read("./App.jsx");
const production = read("./components/Production/Production.jsx");
const history = read("./components/BatchHistory/BatchHistory.jsx");
const hook = read("./hooks/usePollingPaused.js");
const store = read("./store/useStore.jsx");

describe("one computed 'polls stand' condition", () => {
  it("the hook computes it from the whole store state through pollsStand", () => {
    expect(hook).toMatch(/useStore\(\(state\) => pollsStand\(state\)\)/);
  });

  it("no component reads store.pollingPaused on its own any more", () => {
    for (const src of [app, production, history]) {
      expect(src).not.toMatch(/state\.pollingPaused|s\.pollingPaused/);
      expect(src).toMatch(/const pollingPaused = usePollingPaused\(\);/);
    }
  });

  it("windowHidden is written only by the visibilitychange sync in App.jsx", () => {
    expect(store).toMatch(/setWindowHidden: \(val\) => set\(\{ windowHidden: val === true \}\)/);
    expect(app).toMatch(/setWindowHidden\(document\.visibilityState === "hidden"\)/);
    expect(app).toMatch(/document\.addEventListener\("visibilitychange", sync\)/);
    expect(app).toMatch(/document\.removeEventListener\("visibilitychange", sync\)/);
    expect(production).not.toMatch(/setWindowHidden|windowHidden/);
    expect(history).not.toMatch(/setWindowHidden|windowHidden/);
  });

  it("the power pause keeps its own writer (it does not touch windowHidden)", () => {
    expect(app).toMatch(/setPollingPaused\(payload\?\.paused === true\)/);
    expect(store).toMatch(/setPollingPaused: \(val\) => set\(\{ pollingPaused: val === true \}\)/);
  });
});

describe("every periodic poll stands on that condition and ticks once on return", () => {
  it("App.jsx: RIP errors, stages + reprints and the inbox all skip while it is true", () => {
    expect(app).toMatch(/if \(!ripErrorsEnabled \|\| pollingPaused\) return;/);
    expect(app).toMatch(/if \(pollingPaused\) return;[^\n]*\n\s+const id = setInterval\(pollStages, RIP_ERROR_POLL_INTERVAL\);/);
    expect(app).toMatch(/if \(pollingPaused\) return;[^\n]*\n\s+const id = setInterval\(\(\) => \{\n\s+checkInbox\(\);/);
  });

  it("App.jsx: one tick of the stage poll and the inbox on return (the RIP effect reloads on restart by itself)", () => {
    expect(app).toMatch(/useOnPollingResume\(\(\) => \{\s+pollStages\(\);\s+checkInbox\(\);\s+recheckCopying\(\);\s+\}\);/);
  });

  it("Production.jsx: the 15 s poll is one function used by the interval and the return tick", () => {
    expect(production).toMatch(/if \(pollingPaused\) return;[^\n]*\n\s+const id = setInterval\(pollStages, POLL_INTERVAL\);/);
    expect(production).toMatch(/useOnPollingResume\(pollStages\);/);
  });

  it("BatchHistory.jsx: the 30 s poll skips while it is true and ticks on return; no second visibility listener", () => {
    expect(history).toMatch(/if \(pollingPaused\) return;[^\n]*\n\s+const id = setInterval\(tick, POLL_INTERVAL_MS\);/);
    expect(history).toMatch(/useOnPollingResume\(tick\);/);
    expect(history).not.toMatch(/addEventListener\("visibilitychange"/);
  });

  it("the hook fires only on the stopped -> running edge, never on mount", () => {
    expect(hook).toMatch(/useRef\(stopped\)/);
    expect(hook).toMatch(/if \(pollsResumed\(wasStoppedRef\.current, stopped\)\) callbackRef\.current\(\);/);
  });

  it("no raw setInterval of a poll is left outside these effects", () => {
    // ProductionOverviewCard's clock is a label ("x min ago"), deliberately out of scope.
    const count = (src) => (src.match(/setInterval\(/g) ?? []).length;
    expect(count(app)).toBe(3);
    expect(count(production)).toBe(1);
    expect(count(history)).toBe(1);
  });
});
