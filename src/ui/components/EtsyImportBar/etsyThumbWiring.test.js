import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The listing picture of the Inbox bar (FILIP 2026-10-22): IPC, preload and React have no harness here (50f64c8),
// so the chain and the "only while open" rule are pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const thumb = read("./EtsyThumb.jsx");
const bar = read("./EtsyImportBar.jsx");
const css = read("./EtsyImportBar.module.css");
const service = read("../../services/etsyImportService.js");
const preload = read("../../../electron/preload.js");
const handlers = read("../../../electron/ipc/etsyImportHandlers.js");

describe("the Etsy listing picture in the Inbox bar", () => {
  it("crosses one channel: preload (digits only) -> handler -> the bar's guarded request -> the keeper", () => {
    expect(preload).toContain('if (typeof listingId !== "string" || !/^\\d{1,20}$/.test(listingId)) throw new TypeError(');
    expect(preload).toContain('ipcRenderer.invoke("etsy-imports:listingImage", listingId)');
    expect(handlers).toContain('ipcMain.handle("etsy-imports:listingImage", (_event, listingId) => requests.listingImage(listingId));');
    expect(handlers).toContain("listingImage: createEtsyThumbnails({");
    expect(handlers).toContain("getEtsyParts().client.listingThumbnailUrl(listingId)");
    expect(service).toContain("window.api.etsyImports.listingImage(String(listingId))");
  });

  it("each line has its picture, asked only while the bar is OPEN", () => {
    expect(bar).toContain("<EtsyThumb listingId={row.listingId} enabled={open} />");
    expect(thumb).toContain("if (!enabled || !listingId) return undefined;");
    expect(thumb).toMatch(/\}, \[listingId, enabled\]\);/);
  });

  it("the component talks to main only through the service (rule 10) and never builds an address", () => {
    expect(thumb).toContain('import { getEtsyListingImage } from "../../services/etsyImportService";');
    expect(thumb).not.toMatch(/window\.api|https?:\/\/|etsystatic/);
  });

  it("the picture is an item of the row of its own, before the text - the text keeps its 620px basis", () => {
    expect(bar).toMatch(/<li key=\{key\} className=\{styles\.line\}>\s+<EtsyThumb [^>]*\/>\s+(?:\{\/\*[\s\S]*?\*\/\}\s+)?<div className=\{styles\.line_links\}>[\s\S]*?<\/div>\s+<div className=\{styles\.line_text\}>/);
    expect(css).toMatch(/\.thumb\s*\{[^}]*flex-shrink:\s*0;[^}]*width:\s*40px;[^}]*height:\s*40px;/s);
  });
});
