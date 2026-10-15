import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// main.js, preload.js and the renderer cannot be imported from a test (no Electron, no DOM harness), so
// this pins the chain that carries the maximise / restore state: main handlers + events -> preload ->
// service -> TitleBar. Same approach as powerPause.wiring.test.js.

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const main = read("../main.js");
const preload = read("../preload.js");
const service = read("../../ui/services/systemService.js");
const titleBar = read("../../ui/components/TitleBar/TitleBar.jsx");

describe("window maximise / restore wiring", () => {
  it("main toggles on the window's own state and answers the snapshot from it", () => {
    expect(main).toMatch(/ipcMain\.on\("window:toggle-maximize", \(\) => \(win\.isMaximized\(\) \? win\.unmaximize\(\) : win\.maximize\(\)\)\)/);
    expect(main).toMatch(/ipcMain\.handle\("window:is-maximized", \(\) => \(\{ maximized: win\.isMaximized\(\) \}\)\)/);
  });

  it("main pushes the state on BOTH window events (a double click on the title bar sends no IPC)", () => {
    expect(main).toMatch(/win\.on\("maximize", sendMaximized\)/);
    expect(main).toMatch(/win\.on\("unmaximize", sendMaximized\)/);
    expect(main).toMatch(/webContents\.send\("window:maximized-changed", \{ maximized: win\.isMaximized\(\) \}\)/);
  });

  it("the window is created with the clamped start size and the shared minimum", () => {
    expect(main).toMatch(/fitStartSize\(screen\.getPrimaryDisplay\(\)\.workArea\)/);
    expect(main).toMatch(/minWidth: WINDOW_MIN_WIDTH,\s*minHeight: WINDOW_MIN_HEIGHT,/);
    expect(main).toMatch(/win\.maximize\(\);\s*win\.show\(\);/);
  });

  it("preload exposes the three calls on the channels main uses, and the subscription unsubscribes", () => {
    expect(preload).toMatch(/toggleMaximizeWindow: \(\) => ipcRenderer\.send\("window:toggle-maximize"\)/);
    expect(preload).toMatch(/isWindowMaximized: \(\) => ipcRenderer\.invoke\("window:is-maximized"\)/);
    expect(preload).toMatch(/ipcRenderer\.on\("window:maximized-changed", handler\);\s*return \(\) => ipcRenderer\.removeListener\("window:maximized-changed", handler\)/);
  });

  it("the service is the only caller of window.api for them; TitleBar uses the service", () => {
    expect(service).toMatch(/export const toggleMaximizeWindow = \(\) => window\.api\.toggleMaximizeWindow\(\)/);
    expect(service).toMatch(/export const onWindowMaximizedChanged = \(cb\) => window\.api\.onWindowMaximizedChanged\(cb\)/);
    expect(service).toMatch(/export const isWindowMaximized = \(\) => window\.api\.isWindowMaximized\(\)/);
    expect(titleBar).not.toMatch(/window\.api/);
    expect(titleBar).toMatch(/from "\.\.\/\.\.\/services\/systemService"/);
  });

  it("TitleBar follows the events, asks once for a snapshot and unsubscribes on unmount", () => {
    expect(titleBar).toMatch(/onWindowMaximizedChanged\(\(payload\) => setMaximized\(payload\?\.maximized === true\)\)/);
    expect(titleBar).toMatch(/isWindowMaximized\(\)/);
    expect(titleBar).toMatch(/unsubscribe\(\);/);
    expect(titleBar).toMatch(/onClick=\{toggleMaximizeWindow\}/);
  });
});
