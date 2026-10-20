import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// No UI harness (rejected in 50f64c8): the history half of the Ctrl+F search (FILIP 2026-10-20 - an order of
// last month was found only through the Batch tab) is pinned by reading the sources, like
// orderSearchWiring.test.js and orderSearchJumpWiring.test.js.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts) => readFileSync(path.join(SRC, ...parts), "utf8");

const orderSearch = read("ui", "components", "OrderSearch", "OrderSearch.jsx");
const hook = read("ui", "hooks", "usePrintedSearch.js");
const batchHistory = read("ui", "components", "BatchHistory", "BatchHistory.jsx");
const batchRow = read("ui", "components", "BatchHistory", "BatchRow.jsx");
const fileRow = read("ui", "components", "BatchHistory", "FileRow.jsx");

describe("the window starts the sweep once and keeps it", () => {
  it("arms the sweep from the input handler with the first query long enough - never from an effect", () => {
    expect(orderSearch).toMatch(/const \[historyArmed, setHistoryArmed\] = useState\(false\);/);
    expect(orderSearch).toMatch(/const printed = usePrintedSearch\(historyArmed\);/);
    expect(orderSearch).toMatch(/if \(e\.target\.value\.trim\(\)\.length >= MIN_QUERY_LENGTH\) setHistoryArmed\(true\);/);
    // sticky: nothing ever turns it off, a shorter query later must not cancel the listing
    expect(orderSearch).not.toMatch(/setHistoryArmed\(false\)/);
    for (const [, body] of orderSearch.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g)) {
      expect(body).not.toContain("setHistoryArmed");
    }
  });

  it("feeds what the sweep listed into the search and tells the operator how far it is", () => {
    expect(orderSearch).toMatch(/printedDays: printed\.days,/);
    expect(orderSearch).toMatch(/\[query, files, heldIds, heldReasons, productionStages, stageHistory, printed\.days\]/);
    expect(orderSearch).toContain("emptyState(query, result, printed)");
    expect(orderSearch).toContain("printedScanNote(printed)");
  });
});

describe("usePrintedSearch", () => {
  it("reads only through the service (rule 10), caches across windows, and cancels on unmount", () => {
    expect(hook).toContain('from "../services/batchService"');
    expect(hook).not.toContain("window.api");
    expect(hook).toMatch(/const sharedDayCache = new Map\(\);/);
    expect(hook).toMatch(/cache: sharedDayCache/);
    expect(hook).toMatch(/return \(\) => \{\s*cancelled = true;\s*\};/);
    expect(hook).toMatch(/\}, \[armed\]\);/);
  });

  it("reads RUNNING from the moment it is armed, so the window never says 'not found' while it lists the days", () => {
    expect(hook).toMatch(/armed && scan\.status === PRINTED_SCAN\.IDLE \? \{ \.\.\.scan, status: PRINTED_SCAN\.RUNNING \} : scan/);
  });
});

describe("the IPC chain for the day listing", () => {
  it("preload -> ipc handler -> reader, validated at both ends", () => {
    const preload = read("electron", "preload.js");
    expect(preload).toMatch(/readPrintedDayNames: \(dayFolder\) => \{[\s\S]*?isNonEmptyString\(dayFolder\)[\s\S]*?"read-printed-day-names"/);
    const ipc = read("electron", "ipc", "index.js");
    expect(ipc).toMatch(/ipcMain\.handle\("read-printed-day-names", async \(_event, dayFolder\) => \{\s*return readPrintedDayNames\(dayFolder\);/);
    expect(ipc).toMatch(/import \{[^}]*\breadPrintedDayNames\b[^}]*\} from "\.\/readPrintedFolder\.js"/);
    expect(read("ui", "services", "batchService.js")).toMatch(/window\.api\.readPrintedDayNames\(dayFolder\)/);
  });
});

describe("BatchHistory.jsx: the jump to a history file", () => {
  const at = batchHistory.indexOf("const jumpNonce");
  const body = batchHistory.slice(at, batchHistory.indexOf("const filteredDayGroups", at));

  it("serves a Batch task and clears it, on mount or while mounted (the nonce is the dependency)", () => {
    expect(body).toContain("isSearchTargetFor(searchTarget, APP_VIEW.BATCH)");
    expect(body).toMatch(/clearSearchTarget\(target\.nonce\)/);
    expect(body).toMatch(/\[jumpNonce, loadedOnce, isLoading, dayGroups, loadingDays, loadDayContent, clearSearchTarget\]/);
    expect(body).toMatch(/return \(\) => clearTimeout\(timer\);/);
    // not cancelled in the cleanup: clearing the task re-runs the effect
    expect(body).not.toMatch(/cancelReveal|const cancel\b/);
  });

  it("waits for the first read of the PRINTED folder - an empty list before it means 'not read yet'", () => {
    expect(body).toMatch(/if \(!loadedOnce \|\| isLoading\) return;/);
    expect(batchHistory).toMatch(/const \[loadedOnce, setLoadedOnce\] = useState\(false\);/);
    const finallyAt = batchHistory.indexOf("setIsLoading(false);\n      setLoadedOnce(true);");
    expect(finallyAt).toBeGreaterThan(-1);
  });

  it("loads a skeleton day ONCE per task, then gives up with a message instead of retrying", () => {
    expect(body).toMatch(/if \(day\.loaded !== true\) \{/);
    expect(body).toContain("loadingDays.has(day.dayFolder)");
    expect(body).toMatch(/dayLoadTriedRef\.current === target\.nonce\) return finish\(/);
    expect(body).toMatch(/dayLoadTriedRef\.current = target\.nonce;\s*loadDayContent\(day\.dayFolder\);/);
  });

  it("lifts what could hide the batch, opens day and batch BEFORE it looks for the file", () => {
    for (const call of ['setSearchQuery("")', "setActivePrinters(new Set())", "setExpandedDays(", "setExpandedBatches("]) {
      expect(body, call).toContain(call);
    }
    expect(body.indexOf("setExpandedBatches(")).toBeLessThan(body.indexOf("revealElement("));
    expect(body).toContain("data-file-path");
    expect(body).toContain("data-batch-path");
  });

  it("tells the operator when the day, the batch or the file left the history meanwhile", () => {
    expect(body).toMatch(/if \(!day\) return finish\(/);
    expect(body).toMatch(/if \(!batch\) return finish\(/);
    expect(body).toMatch(/finish\(file \? null : /);
    expect(body).toMatch(/notify\(\{ type: "Warning", title: "Not found"/);
  });

  it("is a look, not an action: no selection, no rollback in the jump", () => {
    expect(body).not.toMatch(/selectedFiles|toggleFileSelect|rollback|regenerate/i);
  });

  it("the flash class comes from the render (a class added by hand would end with the next re-render, D60)", () => {
    expect(body).toMatch(/setFoundFilePath\(file\.path\)/);
    expect(batchHistory).toMatch(/foundFilePath=\{foundFilePath\}/);
    expect(batchRow).toMatch(/isFound=\{foundFilePath === file\.path\}/);
    expect(fileRow).toMatch(/\$\{isFound \? style\.file_row_found : ""\}/);
    expect(fileRow).toContain("data-file-path={file.path}");
    expect(batchRow).toContain("data-batch-path={batch.path}");
  });
});
