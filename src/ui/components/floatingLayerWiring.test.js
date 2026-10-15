import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// No UI harness for the floating layer (modals, menus, dropdowns): what keeps it inside a low window (960x560) is pinned by reading the sources.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const rollbackCss = read("./RollbackModal/RollbackModal.module.css");
const productionCss = read("./Production/Production.module.css");
const menuCss = read("./ContextMenu/ContextMenu.module.css");

// The body of the FIRST top-level rule with exactly this selector (media blocks are indented, so a column-0 match skips them).
const ruleBody = (css, selector) => {
  const at = css.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")} \\{`));
  expect(at, `${selector} has a rule of its own`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
};

// The text of an @media block (from its opening brace to the matching closing one).
const mediaBlock = (css, condition) => {
  const at = css.indexOf(`@media (${condition}) {`);
  expect(at, `@media (${condition}) exists`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
  }
  throw new Error(`@media (${condition}) is not closed`);
};

describe("rollback modals scroll inside a low window instead of running off it", () => {
  it.each([
    ["RollbackModal (batch)", rollbackCss],
    ["Production modal (QC / rollback)", productionCss],
  ])("%s has a viewport-bound height and scrolls", (_name, css) => {
    const body = ruleBody(css, ".modal");
    expect(body).toContain("max-height: calc(100vh - 32px);");
    expect(body).toContain("overflow-y: auto;");
  });

  it("the file list of the Production modal gives up height first on a low window", () => {
    const low = mediaBlock(productionCss, "max-height: 720px");
    expect(low).toMatch(/\.qc_file_list \{[^}]*max-height: calc\(100vh - 290px\);/);
  });
});

describe("the context menu stays above the bottom edge of a low window", () => {
  it("rows get shorter under 640 px of height", () => {
    const low = mediaBlock(menuCss, "max-height: 640px");
    expect(low).toMatch(/\.menu \{[^}]*gap: 2px;/);
    expect(low).toMatch(/\.menu_item,\s*\.menu_item_secondary,\s*\.pair_btn \{[^}]*min-height: 32px;/);
  });

  it("the menu itself does not clip (overflow would cut the absolutely positioned submenu)", () => {
    expect(ruleBody(menuCss, ".menu")).not.toMatch(/overflow/);
  });
});
