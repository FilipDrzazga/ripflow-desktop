import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// dlug-6 (D4): main.js, preload.js and the renderer cannot be imported from a test (no Electron, no
// DOM harness). snapshot() has its own test; this pins the chain that carries its answer to
// pollingPaused: handler -> preload -> service -> store action -> the App.jsx startup effect.

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const main = read("../main.js");
const preload = read("../preload.js");
const service = read("../../ui/services/systemService.js");
const store = read("../../ui/store/useStore.jsx");
const app = read("../../ui/App.jsx");

describe("power:get-paused wiring", () => {
  it("main answers the snapshot of the SAME createPowerPause instance the powerMonitor events feed", () => {
    expect(main).toMatch(/ipcMain\.handle\("power:get-paused", \(\) => powerPause\.snapshot\(\)\)/);
    expect(main).toMatch(/powerMonitor\.on\("lock-screen", powerPause\.lock\)/);
  });

  it("preload invokes that channel as getPowerPaused", () => {
    expect(preload).toMatch(/getPowerPaused: \(\) => ipcRenderer\.invoke\("power:get-paused"\)/);
  });

  it("the service is the only caller of window.api.getPowerPaused", () => {
    expect(service).toMatch(/export const getPowerPaused = \(\) => window\.api\.getPowerPaused\(\)/);
    expect(store).not.toMatch(/window\.api/);
    expect(app).not.toMatch(/window\.api/);
  });

  it("the store action sets pollingPaused only on paused === true and survives a failing call", () => {
    const start = store.indexOf("checkPowerPaused: async () => {");
    expect(start, "checkPowerPaused exists").toBeGreaterThan(-1);
    const body = store.slice(start, store.indexOf("},\n", store.indexOf("catch", start)));
    expect(body).toMatch(/const res = await getPowerPaused\(\);/);
    expect(body).toMatch(/if \(res\?\.paused === true\) set\(\{ pollingPaused: true \}\);/);
    expect(body).toMatch(/catch \(err\)/);
    expect(store).toMatch(/import \{[^}]*\bgetPowerPaused\b[^}]*\} from "\.\.\/services\/systemService";/);
  });

  it("App.jsx asks once in the startup effect, next to the other two snapshots, and lists it in the deps", () => {
    const start = app.indexOf("checkDbDegraded();");
    expect(start, "startup snapshots exist").toBeGreaterThan(-1);
    const snapshots = app.slice(start, app.indexOf("await pathsCheck;", start));
    expect(snapshots).toMatch(/checkPrintedRoot\(\);\s*checkPowerPaused\(\);/);
    expect(app).toMatch(/\bcheckPrintedRoot, checkPowerPaused, setShowSetup\]\);/);
  });
});
