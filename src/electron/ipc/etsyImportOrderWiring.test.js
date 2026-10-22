import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// "Import this order" (plan E5): the handler, preload and view load Electron / React, so the chain is pinned by
// reading the sources (comment lines dropped), like etsyPreviewWiring.test.js.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const handlers = read("./etsyImportHandlers.js");
const loop = read("./etsyImportLoop.js");
const engine = read("../helpers/etsyImport.js");
const preload = read("../preload.js");
const service = read("../../ui/services/etsyImportService.js");
const view = read("../../ui/components/Settings/views/EtsyView.jsx");

describe("Import this order - the chain", () => {
  it("channel, preload entry, service and button are one chain; the view never touches window.api", () => {
    expect(handlers).toContain('ipcMain.handle("etsy-imports:importOrder"');
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:importOrder", receiptId)');
    expect(service).toContain("window.api.etsyImports.importOrder(String(receiptId))");
    expect(view).toContain("importEtsyOrder(receiptId)");
    expect(view).not.toMatch(/window\.api/);
  });

  it("only the number crosses: checked in preload and again in main before the loop is asked", () => {
    const entry = preload.slice(preload.indexOf("importOrder:"));
    expect(entry.slice(0, entry.indexOf("ipcRenderer.invoke"))).toMatch(/\/\^\\d\{1,20\}\$\/\.test\(receiptId\)/);
    expect(handlers).toContain("importEtsyReceiptNow(etsyReceiptIdOf(receiptId))");
  });

  it("asks before it imports, and reports through notify()", () => {
    const handler = view.slice(view.indexOf("const handleImportOrder"));
    expect(handler.indexOf("showConfirm(importOrderConfirm(receiptId))")).toBeGreaterThan(-1);
    expect(handler.indexOf("showConfirm(")).toBeLessThan(handler.indexOf("importEtsyOrder("));
    expect(handler).toMatch(/notify\(importOrderNotice\(/);
  });

  it("the order comes from Etsy again in main (getReceipt), never from the screen", () => {
    expect(loop).toContain("getReceipt: (receiptId) => getEtsyParts().client.getReceipt(receiptId)");
    expect(engine).toContain("const receipt = await getReceipt(receiptId);");
  });
});

describe("Import this order - the import's own path", () => {
  it("runs through runReceipts, the same pass as the tick - no second copy path", () => {
    expect(engine).toContain("await runReceipts(await listReceipts(), summary);");
    expect(engine).toContain("await runReceipts([receipt], summary);");
    expect(engine.match(/fs\.copyFile\(/g)).toHaveLength(1);
  });

  it("the gate is the tick's, without the start date only", () => {
    expect(engine).toContain("const blocked = gate({ anyStartDate: true });");
    expect(loop).toContain("gate: (options) => gateReason(isPaused, options),");
  });

  it("shares the tick's `running` (never beside a tick)", () => {
    const importNow = loop.slice(loop.indexOf("importNow = async"));
    expect(importNow).toMatch(/if \(running\) return \{ busy: true \};\s*running = true;/);
  });

  it("never moves the start date: nothing on this path writes etsyImportSince", () => {
    for (const src of [handlers, loop, engine]) {
      expect(src).not.toMatch(/etsyImportSince\s*[:=]|setEtsyImportSince|store\.set\(/);
    }
  });
});
