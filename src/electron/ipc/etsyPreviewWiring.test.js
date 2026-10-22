import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The dry run (Settings > Etsy > Check newest order) loads Electron, so its chain is pinned by reading the sources
// (comment lines dropped), like etsyImportRequestsWiring.test.js.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const preview = read("./etsyPreview.js");
const handlers = read("./etsyImportHandlers.js");
const preload = read("../preload.js");
const service = read("../../ui/services/etsyImportService.js");
const view = read("../../ui/components/Settings/views/EtsyView.jsx");
const loop = read("./etsyImportLoop.js");

describe("Check newest order - the chain", () => {
  it("channel, preload entry, service and button are one chain", () => {
    expect(handlers).toContain('ipcMain.handle("etsy-imports:previewNewest"');
    expect(preload).toContain('previewNewest: () => ipcRenderer.invoke("etsy-imports:previewNewest")');
    expect(service).toContain("window.api.etsyImports.previewNewest()");
    expect(view).toContain('run("check", previewNewestEtsyOrder');
    expect(view).not.toMatch(/window\.api/);
  });

  it("is NOT behind the flag - it is how a person finds out the flag is off - and reports the gate instead", () => {
    const handler = handlers.slice(handlers.indexOf('"etsy-imports:previewNewest"'));
    expect(handler).not.toMatch(/featureOn|getFeature/);
    expect(preview).toContain("const gate = gateReason(() => false);");
    expect(loop).toMatch(/export const gateReason = /);
  });

  it("WRITES NOTHING: the engine gets an import table with `get` only, and the module imports no db write", () => {
    expect(preview).toMatch(/imports: \{ get: getEtsyImport \}/);
    expect(preview).not.toMatch(/claimEtsyImport|setEtsyImportState|moveEtsyImport/);
    expect(preview).toContain("importer.preview(receipt)");
    expect(preview).not.toMatch(/importer\(\)|importer\.tick|copyFile|writeFile/);
  });

  it("the order facts come from receiptFacts with this station's start date", () => {
    expect(preview).toContain("receipt: receiptFacts(receipt, getEtsyImportSince())");
  });

  it("refuses to run without the storage folder or the pattern folder (a readable message, not a path.join crash)", () => {
    expect(preview).toContain('throw failure("The storage folder is not set.")');
    expect(preview).toContain("The Etsy pattern folder is not set");
  });

  it("an error comes back as { success: false, errors } like the other Etsy calls", () => {
    expect(handlers).toMatch(/return \{ success: false, errors: \[toIpcError\(error, "etsy-preview", "Etsy check failed"\)\] \};/);
  });
});
