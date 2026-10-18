import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APP_VIEW } from "../../constants/appViews";
import { SEARCH_TARGET_VIEWS } from "../../utils/searchTarget";
import { ORDER_SEARCH_VIEW } from "../../utils/orderSearch";
import { isViewEnabled } from "../../utils/featureVisibility";

// No UI harness (rejected in 50f64c8): the jump from a Ctrl+F row to the card (plan C3-3) is pinned by
// reading the sources, like orderSearchWiring.test.js.

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => readFileSync(path.join(UI, ...parts), "utf8");

const app = read("App.jsx");
const production = read("components", "Production", "Production.jsx");
const dataList = read("components", "DataList", "DataList.jsx");
const store = read("store", "useStore.jsx");

describe("one set of view ids", () => {
  it("the search targets use the ids App.jsx renders (not a copy)", () => {
    expect(ORDER_SEARCH_VIEW.PRINT).toBe(APP_VIEW.PRINT);
    expect(ORDER_SEARCH_VIEW.PRODUCTION).toBe(APP_VIEW.PRODUCTION);
    expect(SEARCH_TARGET_VIEWS).toEqual([APP_VIEW.PRINT, APP_VIEW.PRODUCTION]);
  });

  it("App.jsx compares and sets activeView through APP_VIEW, never a bare view string", () => {
    expect(app).toContain('import { APP_VIEW } from "./constants/appViews"');
    expect(app).not.toMatch(/activeView === "/);
    expect(app).not.toMatch(/setActiveView\("/);
    expect(app).not.toMatch(/useState\("print"\)/);
    for (const id of Object.keys(APP_VIEW)) expect(app, id).toContain(`activeView === APP_VIEW.${id}`);
  });

  it("every view id the NavBar offers is one APP_VIEW knows", () => {
    const nav = read("components", "NavBar", "NavBar.jsx");
    const ids = [...nav.matchAll(/\bid: "(\w+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(Object.values(APP_VIEW), id).toContain(id);
    for (const [, id] of nav.matchAll(/onViewChange\("(\w+)"\)/g)) expect(Object.values(APP_VIEW), id).toContain(id);
  });
});

describe("a row can always lead to its view on this station", () => {
  // The plan asks for a row without a jump (and a title that says why) when the target view is not offered
  // to the station. Today neither target view is gated by the shop profile or the role, so there is no
  // such row. If one of these starts failing, a gate was added: give the row a disabled state and a title
  // in OrderSearch.jsx (App.jsx already refuses the jump through isViewEnabled).
  it.each(SEARCH_TARGET_VIEWS)("%s is offered whatever the profile says, even with none", (view) => {
    expect(isViewEnabled(view, null)).toBe(true);
    expect(isViewEnabled(view, { features: {} })).toBe(true);
  });
});

describe("App.jsx: choosing a row", () => {
  it("closes the window, files ONE jump task and switches to the view of the task", () => {
    const at = app.indexOf("const handleSearchSelect");
    const body = app.slice(at, app.indexOf("// DB degraded banner", at));
    expect(body).toMatch(/setOrderSearchOpen\(false\);/);
    expect(body).toMatch(/requestSearchJump\(row\.target\)/);
    expect(body).toMatch(/setActiveView\(task\.view\)/);
  });

  it("a view this station does not offer gets no task (it would fire at a later, unrelated visit)", () => {
    const at = app.indexOf("const handleSearchSelect");
    const body = app.slice(at, app.indexOf("// DB degraded banner", at));
    expect(body.indexOf("isViewEnabled(view, shopProfile)")).toBeGreaterThan(-1);
    expect(body.indexOf("isViewEnabled(view, shopProfile)")).toBeLessThan(body.indexOf("requestSearchJump(row.target)"));
  });

  it("hands handleSearchSelect to the window", () => {
    expect(app).toMatch(/<OrderSearch onClose=\{[^}]*\} onSelect=\{handleSearchSelect\} \/>/);
  });
});

describe("the store keeps the task apart from every other signal", () => {
  it("has the task, an ever-growing counter for the nonce, and the clear that only removes its own task", () => {
    expect(store).toMatch(/searchTarget: null,/);
    expect(store).toMatch(/searchJumpSeq: 0,/);
    expect(store).toMatch(/const nonce = get\(\)\.searchJumpSeq \+ 1;/);
    expect(store).toMatch(/state\.searchTarget\.nonce === nonce/);
  });
});

describe("Production.jsx: ONE show-the-file function for the scanner and the jump", () => {
  it("handleScan's file branch calls showFileCard instead of carrying its own copy of the filter clearing", () => {
    const scan = production.slice(production.indexOf("// File-level scan"), production.indexOf("[productionStages, workstationRole, shopProfile"));
    expect(scan).toContain("showFileCard(row);");
    expect(scan).not.toMatch(/setStageFilter|setBatchFilter|setDayFilter|expandDay|setHighlightedId|scrollIntoView|requestAnimationFrame/);
  });

  it("showFileCard keeps the scanner contract: every filter cleared, the day expanded BEFORE the card is looked up", () => {
    const at = production.indexOf("const showFileCard = useCallback(");
    const body = production.slice(at, production.indexOf("const handleScan = useCallback(", at));
    for (const call of ['setStageFilter("all")', "setBatchFilter(null)", "setDayFilter(null)", 'setSearch("")', "setHighlightedId(fileId)"]) {
      expect(body, call).toContain(call);
    }
    expect(body.indexOf("expandDay(")).toBeGreaterThan(-1);
    expect(body.indexOf("expandDay(")).toBeLessThan(body.indexOf("revealElement("));
    expect(body).toMatch(/dayKeyFromBatchPath\(row\.batch_path\) \?\? UNKNOWN_DAY_KEY/);
  });

  it("the jump effect serves a Production task on the Batches lens through showFileCard, then clears it", () => {
    const at = production.indexOf("const jumpNonce");
    const body = production.slice(at, production.indexOf("// ─── Filtering", at));
    expect(body).toContain("isSearchTargetFor(searchTarget, APP_VIEW.PRODUCTION)");
    expect(body).toMatch(/clearSearchTarget\(target\.nonce\)/);
    expect(body).toContain("setViewMode(VIEW_MODE.BATCHES)");
    expect(body).toContain("showFileCard(row)");
    // the nonce is the dependency - a second pick of the same file must fire again
    expect(body).toMatch(/\[jumpNonce, clearSearchTarget, showFileCard\]/);
  });

  it("a file that left Production meanwhile is told to the operator, not skipped silently", () => {
    const at = production.indexOf("const jumpNonce");
    const body = production.slice(at, production.indexOf("// ─── Filtering", at));
    expect(body).toMatch(/if \(!row\) \{[\s\S]*?notify\(\{ type: "Warning"/);
  });
});

describe("DataList.jsx: the Print half of the jump", () => {
  const at = dataList.indexOf("const jumpNonce");
  const body = dataList.slice(at, dataList.indexOf("if (!contextMenu) return undefined;", at));

  it("serves a Print task by lifting only the hiding filters, then scrolls to and flashes the row", () => {
    expect(body).toContain("isSearchTargetFor(searchTarget, APP_VIEW.PRINT)");
    expect(body).toMatch(/clearSearchTarget\(target\.nonce\)/);
    expect(body).toContain("revealPrintFile(target.fileId)");
    expect(body).toContain("data-context-item-id");
    expect(body).toContain("style.list_item_found");
    expect(body).toMatch(/\[jumpNonce, clearSearchTarget, revealPrintFile\]/);
  });

  it("does not cancel the reveal in the cleanup (clearing the task re-runs the effect)", () => {
    expect(body).not.toMatch(/cancelReveal|const cancel\b/);
    expect(body).toMatch(/return \(\) => clearTimeout\(timer\);/);
  });

  it("a file that left the Inbox meanwhile is told to the operator", () => {
    expect(body).toMatch(/!revealPrintFile\(target\.fileId\)\.found[\s\S]*?notify\(\{ type: "Warning"/);
  });

  it("is a look, not an action: no selection, hold or submit call in the jump", () => {
    expect(body).not.toMatch(/Selection|toggleHold|holdFile|submit/);
  });
});
