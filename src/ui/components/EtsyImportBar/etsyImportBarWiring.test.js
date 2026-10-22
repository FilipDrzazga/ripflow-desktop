import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// E4b: no UI harness (50f64c8), so the bar's wiring is pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const service = read("../../services/etsyImportService.js");
const app = read("../../App.jsx");
const css = read("./EtsyImportBar.module.css");

describe("the Etsy bar of the Inbox", () => {
  it("is mounted in the Print view between the filters and the table, and nowhere else", () => {
    expect(app).toMatch(/<DataFilters \/>\s+<EtsyImportBar \/>\s+<InboxWatchPill \/>/);
    expect((app.match(/<EtsyImportBar/g) ?? []).length).toBe(1);
  });

  it("renders only with features.etsy and an open line, after every hook (the hook order never changes)", () => {
    expect(bar).toMatch(/isFeatureEnabled\("etsy", shopProfile\)/);
    expect(bar).toMatch(/if \(!enabled \|\| rows\.length === 0\) return null;/);
    const ret = bar.indexOf("if (!enabled || rows.length === 0) return null;");
    for (const hook of ["useOnPollingResume(", "setInterval(load", "useCallback("]) {
      expect(bar.indexOf(hook)).toBeGreaterThan(-1);
      expect(bar.indexOf(hook)).toBeLessThan(ret);
    }
  });

  it("its poll stands on the one 'polls stand' condition and ticks once on return", () => {
    expect(bar).toMatch(/const pollingPaused = usePollingPaused\(\);/);
    expect(bar).toMatch(/if \(!enabled \|\| pollingPaused\) return undefined;\s+const id = setInterval\(load, ETSY_BAR_POLL_MS\);/);
    expect(bar).toMatch(/useOnPollingResume\(\(\) => \{\s+if \(enabled\) load\(\);\s+\}\);/);
    expect((bar.match(/setInterval\(/g) ?? []).length).toBe(1);
  });

  it("talks to main only through the service (rule 10) and the service only through window.api.etsyImports", () => {
    expect(bar).not.toMatch(/window\.api/);
    for (const call of ["list", "retry", "dismiss", "openListing"]) expect(service).toContain(`window.api.etsyImports.${call}(`);
    expect(service).not.toMatch(/ipcRenderer/);
  });

  it("is inline, not a modal and not a floating layer (no aria-modal, no backdrop, no portal)", () => {
    expect(bar).not.toMatch(/aria-modal|createPortal|backdrop/);
    expect(css).not.toMatch(/backdrop|position:\s*fixed/);
  });

  it("asks before the two steps that cannot be taken back, and reports through notify()", () => {
    expect(bar).toMatch(/isInterrupted\(row\) && !\(await showConfirm\(retryConfirmMessage\(row\)\)\)/);
    expect(bar).toMatch(/if \(!\(await showConfirm\(dismissConfirmMessage\(row\)\)\)\) return;/);
    expect(bar).toContain("notify(retryNotice(res, row)");
    expect(bar).toContain("notify(dismissNotice(res, row)");
    expect(bar).not.toMatch(/setAlert/);
  });

  it("reloads the list after every action - updated:false is 'someone else moved it', not an error", () => {
    expect((bar.match(/await load\(\);/g) ?? []).length).toBe(2);
  });

  it("the table stays reachable on a small window: the open list scrolls inside itself", () => {
    expect(css).toMatch(/\.list\s*\{[^}]*max-height:\s*42vh;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.bar\s*\{[^}]*flex-shrink:\s*0;/s);
  });
});

describe("after a written Retry the field goes back to the database's number (W2)", () => {
  it("clears the typed text only when the request was written (updated true), and after the reload", () => {
    expect(bar).toMatch(/written = res\?\.success === true && res\.updated === true;/);
    expect(bar).toMatch(/await load\(\);\s+if \(written && aliveRef\.current\) setTyped\(\(prev\) => withoutTyped\(prev, key\)\);/);
  });
});
