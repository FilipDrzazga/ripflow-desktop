import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// E4a: the Inbox bar's IPC loads Electron, so the chain is pinned by reading the sources (comment lines
// dropped), like etsyImportWiring.test.js.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const handlers = read("./etsyImportHandlers.js");
const index = read("./index.js");
const preload = read("../preload.js");
const loop = read("./etsyImportLoop.js");
const connection = read("./etsyHandlers.js");

const CHANNELS = ["etsy-imports:list", "etsy-imports:retry", "etsy-imports:dismiss"];

describe("the Inbox bar's IPC", () => {
  it("is registered in registerIpcHandlers", () => {
    expect(index).toMatch(/^\s*registerEtsyImportHandlers\(\);$/m);
  });

  it("every channel has a handler and a preload entry", () => {
    for (const channel of CHANNELS) {
      expect(handlers).toContain(`ipcMain.handle("${channel}"`);
      expect(preload).toContain(`ipcRenderer.invoke("${channel}"`);
    }
  });

  it("preload sends only the line key and the typed number", () => {
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:retry", { receiptId: line.receiptId, transactionId: line.transactionId, xwd: line.xwd ?? null })');
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:dismiss", { receiptId: line.receiptId, transactionId: line.transactionId })');
  });

  it("the gate is getFeature('etsy') and the importer is this station's own switch", () => {
    expect(handlers).toMatch(/featureOn: \(\) => getFeature\("etsy"\)/);
    expect(handlers).toMatch(/isImporter: \(\) => getSettings\(\)\.etsyImportEnabled === true/);
    expect(handlers).not.toMatch(/getShopProfile/);
  });

  it("a retry on the importer starts the loop's own tick (the same guard against two ticks)", () => {
    expect(handlers).toMatch(/requestTick: requestEtsyImportTick/);
    expect(loop).toMatch(/export const requestEtsyImportTick = /);
    expect(loop).toMatch(/runNow = \(\) => \{\s*if \(running\) \{\s*again = true;/);
  });

  it("the loop passes the guarded move to the engine", () => {
    expect(loop).toMatch(/move: moveEtsyImport/);
  });

  it("the station's Etsy connection file stays free of the shared database", () => {
    expect(connection).not.toMatch(/db\.js|etsy-imports:/);
  });
});

describe("the listing link (E4b)", () => {
  it("has a handler, a preload entry and the real browser opener", () => {
    expect(handlers).toContain('ipcMain.handle("etsy-imports:openListing"');
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:openListing", listingId)');
    expect(handlers).toMatch(/openExternal: \(url\) => shell\.openExternal\(url\)/);
  });
});
