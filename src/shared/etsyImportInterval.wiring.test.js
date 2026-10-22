import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// FILIP 2026-10-22: the import's pace is set in Settings > Etsy. The path of the value runs through files with no
// harness of their own (electron-store, the settings IPC, the view), so it is pinned by reading the sources
// (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const settings = read("../electron/helpers/getSettings.js");
const ipc = read("../electron/ipc/index.js");
const loop = read("../electron/ipc/etsyImportLoop.js");
const handlers = read("../electron/ipc/etsyHandlers.js");
const view = read("../ui/components/Settings/views/EtsyView.jsx");

describe("the Etsy import interval from the field to the loop", () => {
  it("is stored per machine and read back clamped, with the shared default", () => {
    expect(settings).toMatch(/etsyImportIntervalMin: ETSY_IMPORT_DEFAULT_MINUTES,/);
    expect(settings).toContain('etsyImportIntervalMin: clampEtsyImportMinutes(store.get("etsyImportIntervalMin")),');
    expect(settings).toContain('if (etsyImportIntervalMin !== undefined) store.set("etsyImportIntervalMin", clampEtsyImportMinutes(etsyImportIntervalMin));');
  });

  it("crosses settings:set (taken from the request and handed to setSettings)", () => {
    const handler = ipc.slice(ipc.indexOf('ipcMain.handle("settings:set"'), ipc.indexOf('ipcMain.handle("dialog:select-folder"'));
    expect((handler.match(/etsyImportIntervalMin/g) ?? []).length).toBe(2);
  });

  it("the loop waits what the setting says, read at each wait", () => {
    expect(loop).toContain("clampEtsyImportMinutes(getSettings().etsyImportIntervalMin) * 60 * 1000");
    expect(loop).toContain("if (!stopped) schedule(etsyImportIntervalMs());");
    expect(loop).not.toMatch(/setInterval\(/);
  });

  it("the view saves the clamped minutes with the other import settings", () => {
    expect(view).toContain("const intervalMin = clampEtsyImportMinutes(intervalText);");
    expect(view).toMatch(/setSettings\(\{ \.\.\.allSettings, etsyImportEnabled: importEnabled, etsyLibraryPath: libraryPath\.trim\(\), etsyImportIntervalMin: intervalMin \}\)/);
    expect(view).toContain("savedImport.minutes !== intervalMin");
  });

  it("Etsy's allowance reaches the view on every etsy:* answer", () => {
    expect(handlers).toContain("limits: parts().client.rateLimits(),");
    expect(view).toContain('if (res && "limits" in res) setLimits(res.limits);');
    expect(view).toContain("etsyPaceLine(intervalMin, limits)");
  });
});
