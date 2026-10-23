import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Plan IMP-W: the warning about a second Etsy importer in Settings > Etsy. React and IPC have no harness here (50f64c8), so
// the chain is pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const view = read("./EtsyView.jsx");
const service = read("../../../services/etsyImportService.js");
const preload = read("../../../../electron/preload.js");
const handlers = read("../../../../electron/ipc/etsyImportHandlers.js");
const loop = read("../../../../electron/ipc/etsyImportLoop.js");

describe("the second-importer warning", () => {
  it("the read crosses one channel: service -> preload -> handler -> the guarded request", () => {
    expect(service).toContain("window.api.etsyImports.otherImporters()");
    expect(preload).toContain('otherImporters: () => ipcRenderer.invoke("etsy-imports:otherImporters")');
    expect(handlers).toContain('ipcMain.handle("etsy-imports:otherImporters", () => requests.otherImporters());');
    expect(handlers).toContain("listImporters: listEtsyImporters");
    expect(handlers).toContain("ownWorkstation: () => getSettings().workstationName");
  });

  it("the view reads it on open and again after a save, and judges by the SAVED switch of this station", () => {
    expect(view).toContain("listEtsyOtherImporters()");
    expect(view).toMatch(/useEffect\(\(\) => \{\s*loadOthers\(\);\s*\}, \[\]\);/);
    expect(view).toMatch(/setSavedImport\(\{ enabled: importEnabled[^}]*\}\);\s*loadOthers\(\);/);
    expect(view).toContain("otherImportersNotice(others, savedImport?.enabled === true)");
  });

  it("the notice sits under the On/Off switch and is a status region", () => {
    const at = view.indexOf("{importersNotice && (");
    expect(at).toBeGreaterThan(view.indexOf("later.</p>") - 1);
    expect(view.slice(at, at + 220)).toContain('role="status"');
  });

  it("a failed read keeps what was shown - it never blanks or errors the view", () => {
    expect(view).toMatch(/if \(res\?\.success && Array\.isArray\(res\.data\)\) setOthers\(res\.data\);/);
    expect(view).toContain(".catch(() => {});");
  });

  it("the loop writes the heartbeat after every tick, before the purge, and never lets it throw", () => {
    expect(loop.indexOf("beat();")).toBeGreaterThan(loop.indexOf("const result = await tick();"));
    expect(loop.indexOf("beat();")).toBeLessThan(loop.indexOf("purgeOldEtsyBuyerNotes();"));
    expect(loop).toMatch(/const beat = \(\) => \{\s*try \{/);
    expect(loop).toContain("if (settings.etsyImportEnabled === true) touchEtsyImporter(");
    expect(loop).toContain("else removeEtsyImporter(workstation);");
  });
});
