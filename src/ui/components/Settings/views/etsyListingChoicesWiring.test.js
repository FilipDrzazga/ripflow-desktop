import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Settings > Etsy > Remembered choices (plan FAB): React and IPC have no harness here (50f64c8), so the chain and the
// rules of the view are pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const view = read("./EtsyListingChoices.jsx");
const etsyView = read("./EtsyView.jsx");
const service = read("../../../services/etsyImportService.js");
const preload = read("../../../../electron/preload.js");
const handlers = read("../../../../electron/ipc/etsyImportHandlers.js");

describe("the remembered choices list", () => {
  it("is part of Settings > Etsy", () => {
    expect(etsyView).toContain('import EtsyListingChoices from "./EtsyListingChoices";');
    expect(etsyView).toContain("<EtsyListingChoices />");
  });

  it("reaches main only through the service, never window.api", () => {
    expect(view).not.toMatch(/window\.api/);
    expect(view).toContain("../../../services/etsyImportService");
    expect(service).toContain('window.api.etsyImports.listingChoices()');
  });

  it("the read crosses one channel: preload -> handler -> the guarded request", () => {
    expect(preload).toContain('listingChoices: () => ipcRenderer.invoke("etsy-imports:listingChoices")');
    expect(handlers).toContain('ipcMain.handle("etsy-imports:listingChoices", () => requests.listingChoices());');
    expect(handlers).toContain("listingTitles: getEtsyListingTitles");
  });

  it("forgetting asks first, and each kind has its own channel", () => {
    expect(view).toMatch(/if \(!\(await showConfirm\(forgetConfirmMessage\(row, kind\)\)\)\) return;/);
    expect(view).toContain("forgetEtsyListingFabric : forgetEtsyListingPrintType");
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:forgetListingFabric", listingId)');
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:forgetListingPrintType", listingId)');
  });

  it("a customer-visible title is React text - never markup", () => {
    expect(view).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });

  it("an unreadable answer says so and never shows an empty list for it", () => {
    expect(view).toContain("choicesLoadError(res).message");
    expect(view).toMatch(/rows === null && !loadError|!loadError && rows === null/);
  });
});
