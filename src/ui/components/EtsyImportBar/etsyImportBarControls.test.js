import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// The controls of an Etsy bar line (FILIP 2026-10-23): the app's own dropdown instead of the system's list, the fields
// kept apart from the buttons, a shorter XWD field. React has no harness here (50f64c8): the sources are read.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const css = read("./EtsyImportBar.module.css");
const select = read("../Select/Select.jsx");
const selectCss = read("../Select/Select.module.css");

describe("the dropdowns of a line", () => {
  it("are the app's Select, not a native <select>", () => {
    expect(bar).toContain('import Select from "../Select/Select";');
    expect(bar).not.toMatch(/<select\b|<option\b/);
    expect(bar.match(/<Select\b/g)).toHaveLength(2);
    expect(css).not.toMatch(/\.select(_narrow)?\s*\{/);
  });

  it("are inside the fields block, before the XWD field, and carry a name for assistive technology", () => {
    const fields = bar.slice(bar.indexOf("<div className={styles.fields}>"), bar.indexOf("{/* Icon buttons in the Batch tab's style"));
    expect(fields.indexOf('ariaLabel="Fabric for this listing"')).toBeGreaterThan(-1);
    expect(fields.indexOf('ariaLabel="Fabric for this listing"')).toBeLessThan(fields.indexOf('ariaLabel="Product type for this listing"'));
    expect(fields.indexOf('ariaLabel="Product type for this listing"')).toBeLessThan(fields.indexOf("<input"));
  });

  it("the Select menu scrolls inside a capped height - the whole Fabrics catalogue is a long list", () => {
    expect(select).toMatch(/MENU_MAX_HEIGHT = 360/);
    expect(select).toContain("Math.min(options.length * OPTION_HEIGHT + 12, MENU_MAX_HEIGHT)");
    expect(selectCss).toMatch(/\.menu\s*\{[^}]*max-height:\s*360px;[^}]*overflow-y:\s*auto;/s);
  });
});

describe("the spacing and the XWD field", () => {
  it("the fields sit apart from the buttons on the right", () => {
    expect(css).toMatch(/\.fields\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px;[^}]*margin-right:\s*16px;/s);
    const actions = bar.slice(bar.indexOf("<div className={styles.actions}>"));
    expect(actions.indexOf("</div>", actions.indexOf("<div className={styles.fields}>"))).toBeLessThan(actions.indexOf('aria-label="Retry"'));
  });

  it("the XWD field is short: six digits and nothing else", () => {
    expect(css).toMatch(/\.input\s*\{[^}]*width:\s*84px;/s);
    expect(bar).toContain('placeholder="XWD"');
    expect(bar).toContain('aria-label="XWD number, six digits"');
  });
});
