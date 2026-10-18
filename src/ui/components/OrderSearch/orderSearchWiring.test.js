import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// No UI harness (rejected in 50f64c8): the window's wiring is pinned by reading the sources, like
// rangeSelectWiring.test.js.

const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(COMPONENTS, ...parts), "utf8");

const jsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return jsxFiles(full);
    return name.endsWith(".jsx") ? [full] : [];
  });

// Anchored popovers and menus: a full-screen click-away backdrop, but not a modal - Ctrl+F may open over them.
const NOT_MODALS = new Set(["ContextMenu.jsx", "RipErrorPopover.jsx"]);

describe("every modal marks itself aria-modal (the ONE mechanism that blocks Ctrl+F)", () => {
  const BACKDROP = /className=\{\s*styles?\.\w*backdrop\w*\s*\}/g;
  const ARIA_MODAL = /aria-modal="true"/g;

  const withBackdrop = jsxFiles(COMPONENTS)
    .filter((f) => !NOT_MODALS.has(path.basename(f)))
    .map((f) => ({ file: path.relative(COMPONENTS, f), src: readFileSync(f, "utf8") }))
    .filter(({ src }) => (src.match(BACKDROP) ?? []).length > 0);

  it("finds the modals this guard exists for (so an empty scan cannot pass)", () => {
    const names = withBackdrop.map((m) => path.basename(m.file));
    for (const known of ["RollbackModal.jsx", "ProductionRollbackModal.jsx", "PdfPreviewModal.jsx", "DataList.jsx", "BatchHistory.jsx", "SetupWizard.jsx", "OrderSearch.jsx"]) {
      expect(names, known).toContain(known);
    }
  });

  it.each(withBackdrop.map((m) => [m.file, m.src]))("%s: one aria-modal=\"true\" per backdrop", (_file, src) => {
    const backdrops = (src.match(BACKDROP) ?? []).length;
    const marked = (src.match(ARIA_MODAL) ?? []).length;
    expect(marked).toBeGreaterThanOrEqual(backdrops);
  });

  it("the anchored popovers stay out of it: nothing in them claims to be modal", () => {
    for (const name of NOT_MODALS) {
      const file = jsxFiles(COMPONENTS).find((f) => path.basename(f) === name);
      expect(file, name).toBeTruthy();
      expect(readFileSync(file, "utf8")).not.toContain('aria-modal="true"');
    }
  });
});

describe("App.jsx: the Ctrl+F shortcut", () => {
  const app = readFileSync(path.join(COMPONENTS, "..", "App.jsx"), "utf8");

  it("goes through the shortcut test and the one blocking function, with the startup and wizard flags", () => {
    expect(app).toContain("isOrderSearchShortcut(e)");
    expect(app).toMatch(/orderSearchBlockedBy\(\{ isLoading, showSetup, doc: document \}\)/);
  });

  it("claims the key in every case and selects the field when the window is already open", () => {
    const at = app.indexOf("isOrderSearchShortcut(e)");
    const body = app.slice(at, app.indexOf("setOrderSearchOpen(true)", at));
    expect(body).toMatch(/^\s*e\.preventDefault\(\);/m);
    expect(body).toMatch(/if \(orderSearchOpen\) \{\s*document\.getElementById\(ORDER_SEARCH_INPUT_ID\)\?\.select\(\);\s*return;/);
    // the "already open" branch comes BEFORE the blocking check - an open window carries aria-modal itself
    expect(body.indexOf("if (orderSearchOpen)")).toBeLessThan(body.indexOf("orderSearchBlockedBy"));
  });

  it("listens on the document, so it also fires from inside a local search field", () => {
    expect(app).toContain('document.addEventListener("keydown", onKeyDown)');
    expect(app).toContain('document.removeEventListener("keydown", onKeyDown)');
  });

  it("mounts the window only while it is open", () => {
    expect(app).toMatch(/\{orderSearchOpen && <OrderSearch /);
  });
});

describe("OrderSearch.jsx: focus stays in the input (so the barcode scanner never fires)", () => {
  const src = read("OrderSearch", "OrderSearch.jsx");

  it("is a modal dialog with a combobox input pointing at the highlighted row", () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('role="combobox"');
    expect(src).toContain("aria-activedescendant");
    expect(src).toMatch(/inputRef\.current\?\.focus\(\)/);
  });

  it("makes no row focusable and keeps a click from pulling the focus off the input", () => {
    expect(src).not.toContain("tabIndex");
    expect(src).toMatch(/if \(e\.target !== inputRef\.current\) e\.preventDefault\(\)/);
    expect(src).toMatch(/if \(e\.key === "Tab"\) e\.preventDefault\(\)/);
  });

  it("closes on Escape and on a click on the backdrop, and stops the Escape from reaching other listeners", () => {
    const esc = src.slice(src.indexOf('e.key === "Escape"'), src.indexOf('e.key === "ArrowDown"'));
    expect(esc).toContain("e.stopPropagation()");
    expect(esc).toContain("onClose()");
    expect(src).toMatch(/className=\{style\.backdrop\} onClick=\{onClose\}/);
  });

  it("is read-only: no IPC, no services, no store writes", () => {
    expect(src).not.toMatch(/window\.api|services\//);
    expect(src).not.toMatch(/useStore\.(setState|getState)/);
    expect(src).not.toMatch(/useStore\(\(s\) => s\.(set|update|remove|add|load|refresh|resolve|clear)\w*\)/);
  });

  it("reads Production only through the matching module, never a copy of its conditions", () => {
    expect(src).toContain('from "@/utils/orderSearch"');
    expect(src).not.toMatch(/PRODUCTION_STAGE|dayKeyFromBatchPath/);
  });
});

describe("the Production scanner stays out of an INPUT (what keeps a scan in the window's field)", () => {
  it("handleScan's key listener returns for INPUT targets and for Ctrl / Meta / Alt keys", () => {
    const production = read("Production", "Production.jsx");
    expect(production).toMatch(/e\.target\.tagName === "INPUT"/);
    expect(production).toMatch(/e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;/);
  });
});

describe("OrderSearch.module.css", () => {
  const css = read("OrderSearch", "OrderSearch.module.css");

  it("sits above every modal and the wizard", () => {
    const zs = [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...zs)).toBeGreaterThan(3200);
  });

  it("keeps the panel inside a low window: viewport-bound height, the list scrolls", () => {
    expect(css).toMatch(/max-height: calc\(100vh - var\(--os-top\) - 16px\)/);
    expect(css).toMatch(/\.list \{[^}]*overflow-y: auto;/);
    expect(css).toMatch(/width: min\(680px, calc\(100vw - 32px\)\)/);
  });
});
