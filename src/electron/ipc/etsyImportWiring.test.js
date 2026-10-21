import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// E3b-2: main.js, the loop and the settings handler load Electron, so the chain is pinned by reading the
// sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const main = read("../main.js");
const loop = read("./etsyImportLoop.js");
const engine = read("../helpers/etsyImport.js");
const index = read("./index.js");
const history = read("./batchHistoryHandlers.js");
const settings = read("../helpers/getSettings.js");

describe("the Etsy import loop", () => {
  it("is started from main.js with the isPaused of the SAME createPowerPause instance", () => {
    expect(main).toMatch(/const powerPause = createPowerPause\(/);
    expect(main).toMatch(/startEtsyImportLoop\(\{ isPaused: powerPause\.isPaused \}\)/);
  });

  it("asks the gate with every fact, the flag read through getFeature (not the DB) and the pause passed in", () => {
    expect(loop).toMatch(/etsyImportGate\(\{/);
    expect(loop).toMatch(/featureOn: getFeature\("etsy"\)/);
    expect(loop).toMatch(/paused: isPaused\(\)/);
    expect(loop).toMatch(/since: getEtsyImportSince\(\)/);
    expect(loop).not.toMatch(/getShopProfile/);
  });

  it("lists orders from the moment the import was switched on, through the one client the Settings view uses", () => {
    expect(loop).toMatch(/listOpenReceipts\(\{ minCreated: getEtsyImportSince\(\) \}\)/);
    expect(loop).toMatch(/getEtsyParts\(\)/);
  });

  it("never overlaps two ticks", () => {
    expect(loop).toMatch(/if \(running\) return;/);
  });
});

describe("the import writes nothing but through the shared helpers", () => {
  it("no bare rename in the engine or the loop: the name is taken with renameNoOverwrite", () => {
    for (const src of [engine, loop]) {
      expect(src).not.toMatch(/fs\.rename\(|\.promises\.rename\(|renameSync\(/);
    }
    expect(loop).toMatch(/renameNoOverwrite/);
    expect(engine).toMatch(/await renameNoOverwrite\(tmp, finalPath\)/);
  });

  it("the engine has no Electron, no database and no settings import (everything real is injected)", () => {
    expect(engine).not.toMatch(/from "electron|from "\.\/db\.js"|getSettings|from "node:fs"/);
  });

  it("rollback shares the same renameNoOverwrite and keeps no copy of it", () => {
    expect(history).toMatch(/import \{ renameNoOverwrite \} from "\.\.\/helpers\/renameNoOverwrite\.js";/);
    expect(history).not.toMatch(/const renameNoOverwrite = /);
  });
});

describe("the two station settings", () => {
  it("settings:set takes both, refuses a library folder that does not exist, and passes them on", () => {
    expect(index).toMatch(/etsyImportEnabled, etsyLibraryPath/);
    expect(index).toMatch(/Etsy library folder does not exist/);
    expect(index).toMatch(/setSettings\(\{[^}]*etsyImportEnabled, etsyLibraryPath/);
  });

  it("getSettings keeps the start moment out of the object the renderer gets (it is not a setting)", () => {
    const getter = settings.slice(settings.indexOf("export const getSettings"), settings.indexOf("export const setSettings"));
    expect(getter).not.toMatch(/etsyImportSince/);
  });
});
