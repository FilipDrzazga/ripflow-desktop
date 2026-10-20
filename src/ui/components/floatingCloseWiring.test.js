import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness: the D59 wiring is pinned by reading the sources. Ctrl+F opens the order search; every floating layer that is
// not a modal (no aria-modal) has to be told to close first, or it stays open under the window.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("Ctrl+F closes the floating layers before the order search opens (D59)", () => {
  it("App asks for the close right before it opens the window, and only when the window is not blocked", () => {
    const app = read("../App.jsx");
    expect(app).toContain('import { closeFloatingLayers } from "./utils/floatingLayers";');
    const blocked = app.indexOf("orderSearchBlockedBy({ isLoading, showSetup, doc: document })) return;");
    const close = app.indexOf("closeFloatingLayers();");
    const open = app.indexOf("setOrderSearchOpen(true);");
    expect(blocked).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(blocked);
    expect(open).toBeGreaterThan(close);
  });

  it.each([
    ["ContextMenu", "./ContextMenu/ContextMenu.jsx", "useFloatingClose(onClose);"],
    ["RipErrorPopover", "./RipErrorPopover/RipErrorPopover.jsx", "useFloatingClose(onClose);"],
    ["Select", "./Select/Select.jsx", "useFloatingClose(() => setOpen(false), open);"],
    ["Filter panel (DataFilters)", "./DataFilters/DataFilters.jsx", "useFloatingClose(() => setPanelOpen(false), panelOpen);"],
  ])("%s subscribes through useFloatingClose", (_name, rel, call) => {
    const src = read(rel);
    expect(src).toMatch(/import \{ useFloatingClose \} from "(\.\.\/\.\.|@)\/?hooks\/useFloatingClose";/);
    expect(src).toContain(call);
  });

  it("RipErrorPopover subscribes before its early return, so the hook order never changes", () => {
    const src = read("./RipErrorPopover/RipErrorPopover.jsx");
    expect(src.indexOf("useFloatingClose(onClose);")).toBeLessThan(src.indexOf("if (!error) return null;"));
  });

  it("the hook listens on window for the one event and removes the listener", () => {
    const hook = read("../hooks/useFloatingClose.js");
    expect(hook).toContain("window.addEventListener(CLOSE_FLOATING_EVENT, handler)");
    expect(hook).toContain("window.removeEventListener(CLOSE_FLOATING_EVENT, handler)");
    expect(hook).toContain("if (!active) return undefined;");
  });
});

describe("the Print row flash is part of the render (D60)", () => {
  it("DataList gives the found row its class from foundFileId, not by hand on the element", () => {
    const src = read("./DataList/DataList.jsx");
    expect(src).toContain("foundFileId === item.id ? style.list_item_found : null");
    expect(src).not.toMatch(/classList\.(add|remove)\(style\.list_item_found/);
    expect(src).toMatch(/setTimeout\(\(\) => setFoundFileId\(null\), FOUND_FLASH_MS\)/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => clearTimeout\(foundTimerRef\.current\), \[\]\);/);
  });
});
